import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  FORMATS,
  type AgentConfig,
  type HandoutResponse,
  type Lang,
  type MatchConfig,
  type MatchDetail,
  type MemberRole,
  type Provider,
  type TeamConfig,
  type TeamKey,
} from "@debate/shared";
import { listAvatars } from "./avatars.js";
import { serverStrings, type ServerStrings } from "./i18n.js";
import { ASSETS_DIR, DATA_DIR, WEB_DIST, matchPaths } from "./paths.js";
import { abortMatch, isRunning, startMatch } from "./runner.js";
import {
  createMatch,
  deleteMatch,
  ensureDir,
  getConfig,
  getReview,
  getSeal,
  getState,
  getVerdicts,
  listMatches,
  readEvents,
  subscribe,
} from "./store.js";
import { ttsAvailable } from "./tts.js";

const app = new Hono();

/* ---------- Basic info ---------- */

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/formats", (c) => c.json(FORMATS));

app.get("/api/avatars", (c) => c.json(listAvatars()));

app.get("/api/providers", (c) =>
  c.json({
    // Provider display labels are localized on the web side; the server returns ids only.
    providers: [{ id: "mock" }, { id: "claude" }, { id: "codex" }, { id: "opencode" }],
    tts: { ja: ttsAvailable("ja"), en: ttsAvailable("en") },
  }),
);

/* ---------- Match creation ---------- */

interface MemberPayload {
  name?: string;
  provider: Provider;
  model?: string;
  reasoningEffort?: string;
  avatarId?: string;
}

interface TeamPayload {
  name?: string;
  mode: "council" | "roles";
  members: MemberPayload[];
  captainIndex?: number;
  roles?: Record<string, MemberRole>; // index (string) -> role
}

interface CreateMatchPayload {
  topic: string;
  affirmative?: TeamKey | "random";
  teams: { A: TeamPayload; B: TeamPayload };
  judges: MemberPayload[];
  reviewer?: MemberPayload;
  formatId: string;
  lang?: Lang;
  tts?: boolean;
  autoAdvance?: boolean;
  /** 旧名 demo。どちらのキーでも受け付ける */
  exhibition?: boolean;
  demo?: boolean;
}

const PROVIDERS: Provider[] = ["mock", "claude", "codex", "opencode"];

function buildTeam(team: TeamKey, p: TeamPayload, avatarIds: string[], avatarCursor: { i: number }, t: ServerStrings): TeamConfig {
  const members: AgentConfig[] = p.members.map((m, i) => ({
    id: `${team}${i + 1}`,
    name: m.name?.trim() || `${m.provider}-${team}${i + 1}`,
    provider: m.provider,
    model: m.model?.trim() || undefined,
    reasoningEffort: m.reasoningEffort?.trim() || undefined,
    avatarId: m.avatarId || avatarIds[avatarCursor.i++ % Math.max(avatarIds.length, 1)],
  }));
  const roles: Record<string, MemberRole> = {};
  for (const [idx, role] of Object.entries(p.roles ?? {})) {
    const member = members[Number(idx)];
    if (member) roles[member.id] = role;
  }
  return {
    name: p.name?.trim() || t.defaultTeamName(team),
    mode: p.mode,
    members,
    captainId: members[Math.min(p.captainIndex ?? 0, members.length - 1)]?.id,
    roles: p.mode === "roles" ? roles : undefined,
  };
}

function validatePayload(p: CreateMatchPayload, t: ServerStrings): string[] {
  const errors: string[] = [];
  if (!p.topic?.trim()) errors.push(t.errTopicRequired);
  if (!FORMATS.some((f) => f.id === p.formatId)) errors.push(t.errBadFormat);
  for (const key of ["A", "B"] as TeamKey[]) {
    const team = p.teams?.[key];
    if (!team || !Array.isArray(team.members) || team.members.length < 1 || team.members.length > 5) {
      errors.push(t.errTeamMemberCount(key));
      continue;
    }
    for (const m of team.members) {
      if (!PROVIDERS.includes(m.provider)) errors.push(t.errBadProvider(key, m.provider));
    }
  }
  if (!Array.isArray(p.judges) || p.judges.length < 1 || p.judges.length % 2 === 0) {
    errors.push(t.errOddJudges);
  }
  return errors;
}

app.post("/api/matches", async (c) => {
  const payload = (await c.req.json()) as CreateMatchPayload;
  const lang: Lang = payload.lang === "en" ? "en" : "ja";
  const t = serverStrings(lang);
  const errors = validatePayload(payload, t);
  if (errors.length > 0) return c.json({ errors }, 400);

  const avatarIds = listAvatars().map((a) => a.id);
  const cursor = { i: 0 };
  const affirmative: TeamKey =
    payload.affirmative === "A" || payload.affirmative === "B"
      ? payload.affirmative
      : Math.random() < 0.5
        ? "A"
        : "B";

  const id = `m-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}-${randomUUID().slice(0, 6)}`;
  // 旧クライアント/設定ファイルの "demo" も受け付ける
  const exhibition = payload.exhibition ?? payload.demo ?? false;
  // 感想戦の解説（コメンテーター）は審査員 1 が兼任する。旧クライアントの明示指定があればそちらを優先
  const chief = payload.reviewer ?? payload.judges[0];
  const config: MatchConfig = {
    id,
    topic: payload.topic.trim(),
    createdAt: new Date().toISOString(),
    affirmative,
    teams: {
      A: buildTeam("A", payload.teams.A, avatarIds, cursor, t),
      B: buildTeam("B", payload.teams.B, avatarIds, cursor, t),
    },
    judges: payload.judges.map((j, i) => ({
      id: `J${i + 1}`,
      name: j.name?.trim() || t.defaultJudgeName(i + 1, j.provider),
      provider: j.provider,
      model: j.model?.trim() || undefined,
      reasoningEffort: j.reasoningEffort?.trim() || undefined,
      avatarId: j.avatarId || avatarIds[cursor.i++ % Math.max(avatarIds.length, 1)],
    })),
    reviewer: {
      id: "reviewer",
      name: chief?.name?.trim() || t.defaultReviewerName(chief?.provider ?? "mock"),
      provider: chief?.provider ?? "mock",
      model: chief?.model?.trim() || undefined,
      reasoningEffort: chief?.reasoningEffort?.trim() || undefined,
    },
    formatId: payload.formatId,
    lang,
    tts: (payload.tts ?? true) && ttsAvailable(lang),
    // Exhibition mode is "generate everything, then play it all back", so it always auto-advances.
    autoAdvance: exhibition ? true : (payload.autoAdvance ?? true),
    exhibition,
    limits: { prepMaxCalls: 12, fixRetries: 2, regenerateRetries: 1 },
  };

  createMatch(config);
  return c.json({ id, config });
});

/* ---------- Match retrieval & progression ---------- */

app.get("/api/matches", (c) => c.json(listMatches()));

app.get("/api/matches/:id", (c) => {
  const id = c.req.param("id");
  const config = getConfig(id);
  if (!config) return c.json({ error: "not found" }, 404);
  const detail: MatchDetail = {
    config,
    state: getState(id),
    events: readEvents(id),
    seals: { A: getSeal(id, "A"), B: getSeal(id, "B") },
    verdicts: getVerdicts(id),
    review: getReview(id),
    ttsAvailable: ttsAvailable(config.lang),
  };
  return c.json(detail);
});

app.delete("/api/matches/:id", (c) => {
  const id = c.req.param("id");
  const t = serverStrings(getConfig(id)?.lang ?? "ja");
  if (isRunning(id)) abortMatch(id);
  try {
    const deleted = deleteMatch(id);
    if (!deleted) return c.json({ error: t.deleteNotFound }, 404);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: t.deleteFailed(e instanceof Error ? e.message : String(e)) }, 500);
  }
});

app.post("/api/matches/:id/phase", async (c) => {
  const id = c.req.param("id");
  if (!getConfig(id)) return c.json({ error: "not found" }, 404);
  const result = startMatch(id);
  if (!result.ok) return c.json({ error: result.message }, 409);
  return c.json({ ok: true, phase: getState(id).phase, running: isRunning(id) });
});

app.post("/api/matches/:id/abort", (c) => {
  const id = c.req.param("id");
  const ok = abortMatch(id);
  return c.json({ ok });
});

/* ---------- SSE ---------- */

app.get("/api/matches/:id/events", (c) => {
  const id = c.req.param("id");
  if (!getConfig(id)) return c.json({ error: "not found" }, 404);
  const from = Number(c.req.query("from") ?? "0");

  return streamSSE(c, async (stream) => {
    let closed = false;
    stream.onAbort(() => {
      closed = true;
    });

    for (const ev of readEvents(id).slice(from)) {
      await stream.writeSSE({ event: "match", data: JSON.stringify(ev) });
    }
    const unsub = subscribe(id, (ev) => {
      void stream.writeSSE({ event: "match", data: JSON.stringify(ev) });
    });

    try {
      while (!closed) {
        await stream.writeSSE({ event: "state", data: JSON.stringify(getState(id)) });
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      unsub();
    }
  });
});

/* ---------- Handouts & audio ---------- */

app.get("/api/matches/:id/handouts/:team", (c) => {
  const id = c.req.param("id");
  const team = c.req.param("team") as TeamKey;
  if (team !== "A" && team !== "B") return c.json({ error: "bad team" }, 400);
  const dir = matchPaths.handoutDir(id, team);
  const handoutFile = path.join(dir, "handout.md");
  const evidenceFile = path.join(dir, "evidence.json");
  if (!fs.existsSync(handoutFile)) return c.json({ error: "not sealed yet" }, 404);
  const res: HandoutResponse = {
    team,
    handout: fs.readFileSync(handoutFile, "utf8"),
    evidence: fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile, "utf8")) : [],
    seal: getSeal(id, team),
  };
  return c.json(res);
});

app.get("/api/matches/:id/audio/:refId", (c) => {
  const id = c.req.param("id");
  const refId = c.req.param("refId").replace(/[^\w-]/g, "");
  const file = path.join(matchPaths.audioDir(id), `${refId}.wav`);
  if (!fs.existsSync(file)) return c.json({ error: "no audio" }, 404);
  const buf = fs.readFileSync(file);
  return c.body(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, 200, {
    "Content-Type": "audio/wav",
    "Cache-Control": "public, max-age=3600",
  });
});

/* ---------- Static serving (avatar assets, built web UI) ---------- */

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function serveFile(absPath: string): Response | null {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;
  const buf = fs.readFileSync(absPath);
  const type = MIME[path.extname(absPath).toLowerCase()] ?? "application/octet-stream";
  return new Response(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=300" } });
}

function resolveInside(baseDir: string, relPath: string): string | null {
  const base = path.resolve(baseDir);
  const abs = path.resolve(base, relPath);
  const rel = path.relative(base, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

app.get("/assets/*", (c) => {
  const rel = decodeURIComponent(c.req.path.replace(/^\/assets\//, ""));

  // Vite's production build also uses /assets/*.js|css. Serve it before avatar assets.
  const webAsset = resolveInside(path.join(WEB_DIST, "assets"), rel);
  if (webAsset) {
    const webRes = serveFile(webAsset);
    if (webRes) return webRes;
  }

  const abs = resolveInside(ASSETS_DIR, rel);
  if (!abs) return c.json({ error: "forbidden" }, 403);
  const res = serveFile(abs);
  return res ?? c.json({ error: "not found" }, 404);
});

app.get("*", (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not found" }, 404);
  if (fs.existsSync(WEB_DIST)) {
    const rel = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
    const abs = resolveInside(WEB_DIST, rel);
    if (abs) {
      const res = serveFile(abs);
      if (res) return res;
    }
    const index = serveFile(path.join(WEB_DIST, "index.html"));
    if (index) return index;
  }
  return c.text("The web UI is not built. During development, use http://localhost:56173.", 404);
});

ensureDir(DATA_DIR);
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  const tts = `ja: ${ttsAvailable("ja") ? "on" : "off"}, en: ${ttsAvailable("en") ? "on" : "off"}`;
  console.log(`debate server: http://127.0.0.1:${info.port} (tts: ${tts})`);
});

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
  type MatchConfig,
  type MatchDetail,
  type MemberRole,
  type Provider,
  type TeamConfig,
  type TeamKey,
} from "@debate/shared";
import { listAvatars } from "./avatars.js";
import { ASSETS_DIR, DATA_DIR, WEB_DIST, matchPaths } from "./paths.js";
import { abortMatch, isRunning, startMatch } from "./runner.js";
import {
  createMatch,
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

/* ---------- 基本情報 ---------- */

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/formats", (c) => c.json(FORMATS));

app.get("/api/avatars", (c) => c.json(listAvatars()));

app.get("/api/providers", (c) =>
  c.json({
    providers: [
      { id: "mock", label: "Mock（動作確認用・即応答）" },
      { id: "claude", label: "Claude Code" },
      { id: "codex", label: "Codex" },
      { id: "opencode", label: "OpenCode" },
    ],
    ttsAvailable: ttsAvailable(),
  }),
);

/* ---------- 試合作成 ---------- */

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
  roles?: Record<string, MemberRole>; // index (文字列) → 役割
}

interface CreateMatchPayload {
  topic: string;
  affirmative?: TeamKey | "random";
  teams: { A: TeamPayload; B: TeamPayload };
  judges: MemberPayload[];
  reviewer?: MemberPayload;
  formatId: string;
  tts?: boolean;
  autoAdvance?: boolean;
}

const PROVIDERS: Provider[] = ["mock", "claude", "codex", "opencode"];

function buildTeam(team: TeamKey, p: TeamPayload, avatarIds: string[], avatarCursor: { i: number }): TeamConfig {
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
    name: p.name?.trim() || `チーム${team}`,
    mode: p.mode,
    members,
    captainId: members[Math.min(p.captainIndex ?? 0, members.length - 1)]?.id,
    roles: p.mode === "roles" ? roles : undefined,
  };
}

function validatePayload(p: CreateMatchPayload): string[] {
  const errors: string[] = [];
  if (!p.topic?.trim()) errors.push("論題を入力してください");
  if (!FORMATS.some((f) => f.id === p.formatId)) errors.push("フォーマットが不正です");
  for (const key of ["A", "B"] as TeamKey[]) {
    const t = p.teams?.[key];
    if (!t || !Array.isArray(t.members) || t.members.length < 1 || t.members.length > 5) {
      errors.push(`チーム${key} のメンバーは1〜5人にしてください`);
      continue;
    }
    for (const m of t.members) {
      if (!PROVIDERS.includes(m.provider)) errors.push(`チーム${key} に不正なプロバイダ: ${m.provider}`);
    }
  }
  if (!Array.isArray(p.judges) || p.judges.length < 1 || p.judges.length % 2 === 0) {
    errors.push("審査員は奇数人（1・3・5人）にしてください");
  }
  return errors;
}

app.post("/api/matches", async (c) => {
  const payload = (await c.req.json()) as CreateMatchPayload;
  const errors = validatePayload(payload);
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
  const config: MatchConfig = {
    id,
    topic: payload.topic.trim(),
    createdAt: new Date().toISOString(),
    affirmative,
    teams: {
      A: buildTeam("A", payload.teams.A, avatarIds, cursor),
      B: buildTeam("B", payload.teams.B, avatarIds, cursor),
    },
    judges: payload.judges.map((j, i) => ({
      id: `J${i + 1}`,
      name: j.name?.trim() || `審査員${i + 1}（${j.provider}）`,
      provider: j.provider,
      model: j.model?.trim() || undefined,
      reasoningEffort: j.reasoningEffort?.trim() || undefined,
      avatarId: j.avatarId || avatarIds[cursor.i++ % Math.max(avatarIds.length, 1)],
    })),
    reviewer: {
      id: "reviewer",
      name: payload.reviewer?.name?.trim() || `解説（${payload.reviewer?.provider ?? "mock"}）`,
      provider: payload.reviewer?.provider ?? "mock",
      model: payload.reviewer?.model?.trim() || undefined,
      reasoningEffort: payload.reviewer?.reasoningEffort?.trim() || undefined,
    },
    formatId: payload.formatId,
    tts: (payload.tts ?? true) && ttsAvailable(),
    autoAdvance: payload.autoAdvance ?? true,
    limits: { prepMaxCalls: 12, fixRetries: 2, regenerateRetries: 1 },
  };

  createMatch(config);
  return c.json({ id, config });
});

/* ---------- 試合の取得・進行 ---------- */

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
    ttsAvailable: ttsAvailable(),
  };
  return c.json(detail);
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

/* ---------- ハンドアウト・音声 ---------- */

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

/* ---------- 静的配信（アバター素材・ビルド済み Web UI） ---------- */

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

  // Vite の本番ビルドも /assets/*.js|css を使う。アバター素材より先に配信する。
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
  return c.text("web UI は未ビルドです。開発時は http://localhost:5173 を使ってください。", 404);
});

ensureDir(DATA_DIR);
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`debate server: http://127.0.0.1:${info.port} (tts: ${ttsAvailable() ? "available" : "unavailable"})`);
});

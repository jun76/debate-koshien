import fs from "node:fs";
import path from "node:path";
import type {
  MatchConfig,
  MatchEvent,
  MatchState,
  MatchSummary,
  Phase,
  Review,
  Seal,
  TeamKey,
  Verdict,
} from "@debate/shared";
import { DATA_DIR, matchDir, matchPaths } from "./paths.js";

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T | undefined {
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function writeJson(file: string, value: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

/* ---------- イベントバス ---------- */

type Listener = (ev: MatchEvent) => void;
const listeners = new Map<string, Set<Listener>>();
const eventCache = new Map<string, MatchEvent[]>();

export function subscribe(matchId: string, fn: Listener): () => void {
  let set = listeners.get(matchId);
  if (!set) {
    set = new Set();
    listeners.set(matchId, set);
  }
  set.add(fn);
  return () => set.delete(fn);
}

export function readEvents(matchId: string): MatchEvent[] {
  const cached = eventCache.get(matchId);
  if (cached) return cached;
  const file = matchPaths.debateLog(matchId);
  const events: MatchEvent[] = [];
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as MatchEvent);
      } catch {
        // 壊れた行は読み飛ばす（append 中のクラッシュなど）
      }
    }
  }
  eventCache.set(matchId, events);
  return events;
}

export function appendEvent<T extends Omit<MatchEvent, "seq" | "at">>(
  matchId: string,
  ev: T,
): MatchEvent {
  const events = readEvents(matchId);
  const full = { ...ev, seq: events.length, at: new Date().toISOString() } as unknown as MatchEvent;
  const file = matchPaths.debateLog(matchId);
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(full) + "\n", "utf8");
  events.push(full);
  for (const fn of listeners.get(matchId) ?? []) {
    try {
      fn(full);
    } catch {
      // リスナー側の例外で進行を止めない
    }
  }
  return full;
}

/* ---------- 試合 CRUD ---------- */

export function createMatch(config: MatchConfig): void {
  ensureDir(matchDir(config.id));
  writeJson(matchPaths.config(config.id), config);
  setState(config.id, { phase: "setup" });
}

export function getConfig(matchId: string): MatchConfig | undefined {
  return readJson<MatchConfig>(matchPaths.config(matchId));
}

export function getState(matchId: string): MatchState {
  return (
    readJson<MatchState>(matchPaths.state(matchId)) ?? {
      phase: "setup",
      updatedAt: new Date().toISOString(),
    }
  );
}

export function setState(matchId: string, state: Omit<MatchState, "updatedAt">): MatchState {
  const full: MatchState = { ...state, updatedAt: new Date().toISOString() };
  writeJson(matchPaths.state(matchId), full);
  return full;
}

export function setPhase(matchId: string, phase: Phase, detail?: string): void {
  setState(matchId, { phase, progress: detail });
  appendEvent(matchId, { type: "phase", phase, detail });
}

export function setProgress(matchId: string, progress: string): void {
  const st = getState(matchId);
  setState(matchId, { phase: st.phase, error: st.error, progress });
}

export function listMatches(): MatchSummary[] {
  if (!fs.existsSync(DATA_DIR)) return [];
  const out: MatchSummary[] = [];
  for (const ent of fs.readdirSync(DATA_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const config = getConfig(ent.name);
    if (!config) continue;
    out.push({
      id: config.id,
      topic: config.topic,
      createdAt: config.createdAt,
      phase: getState(config.id).phase,
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function deleteMatch(matchId: string): boolean {
  const dir = matchDir(matchId);
  const resolvedDir = path.resolve(dir);
  const resolvedData = path.resolve(DATA_DIR);
  if (!resolvedDir.startsWith(resolvedData + path.sep)) return false;
  if (!fs.existsSync(resolvedDir)) return false;
  fs.rmSync(resolvedDir, { recursive: true, force: true });
  eventCache.delete(matchId);
  listeners.delete(matchId);
  return true;
}

/* ---------- 封印・審査・レビュー ---------- */

export function saveSeal(matchId: string, seal: Seal): void {
  writeJson(matchPaths.sealFile(matchId, seal.team), seal);
}

export function getSeal(matchId: string, team: TeamKey): Seal | undefined {
  return readJson<Seal>(matchPaths.sealFile(matchId, team));
}

export function saveVerdict(matchId: string, verdict: Verdict): void {
  writeJson(matchPaths.verdictFile(matchId, verdict.judgeId), verdict);
}

export function getVerdicts(matchId: string): Verdict[] {
  const dir = matchPaths.verdictDir(matchId);
  if (!fs.existsSync(dir)) return [];
  const out: Verdict[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const v = readJson<Verdict>(path.join(dir, f));
    if (v) out.push(v);
  }
  return out;
}

export function saveReview(matchId: string, review: Review): void {
  writeJson(matchPaths.review(matchId), review);
}

export function getReview(matchId: string): Review | undefined {
  return readJson<Review>(matchPaths.review(matchId));
}

export function saveAgentLog(matchId: string, label: string, payload: unknown): void {
  const dir = matchPaths.agentLogDir(matchId);
  ensureDir(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `${stamp}-${label.replace(/[^\w-]/g, "_")}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

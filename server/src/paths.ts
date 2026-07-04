import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Project root (debate-koshien/). */
export const ROOT = path.resolve(here, "..", "..");
export const DATA_DIR = path.join(ROOT, "data", "matches");
export const ASSETS_DIR = path.join(ROOT, "assets");
export const AVATARS_DIR = path.join(ASSETS_DIR, "avatars");
export const TTS_DIR = path.join(ASSETS_DIR, "tts");
export const WEB_DIST = path.join(ROOT, "web", "dist");

export function matchDir(matchId: string): string {
  return path.join(DATA_DIR, matchId);
}

export const matchPaths = {
  config: (id: string) => path.join(matchDir(id), "config.json"),
  state: (id: string) => path.join(matchDir(id), "state.json"),
  prepWorkspace: (id: string, team: string) => path.join(matchDir(id), "prep", `team${team}`, "workspace"),
  handoutDir: (id: string, team: string) => path.join(matchDir(id), "handouts", `team${team}`),
  sealFile: (id: string, team: string) => path.join(matchDir(id), "seals", `team${team}.json`),
  sealedSnapshotDir: (id: string, team: string) => path.join(matchDir(id), "seals", "snapshot", `team${team}`),
  debateLog: (id: string) => path.join(matchDir(id), "logs", "debate.jsonl"),
  agentLogDir: (id: string) => path.join(matchDir(id), "logs", "agents"),
  audioDir: (id: string) => path.join(matchDir(id), "logs", "audio"),
  verdictFile: (id: string, judgeId: string) => path.join(matchDir(id), "verdicts", `${judgeId}.json`),
  verdictDir: (id: string) => path.join(matchDir(id), "verdicts"),
  review: (id: string) => path.join(matchDir(id), "review.json"),
  judgeWorkspace: (id: string, judgeId: string) => path.join(matchDir(id), "judging", judgeId),
};

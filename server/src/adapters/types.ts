import type { AgentConfig, FormatPart, Side, TeamKey } from "@debate/shared";

export type InvocationKind =
  | "prep-research"
  | "prep-compile"
  | "prep-fix"
  | "draft"
  | "merge"
  | "speech"
  | "question"
  | "answer"
  | "regenerate"
  | "judge"
  | "review";

/** mock アダプタがそれらしい内容を生成するためのヒント。実 CLI アダプタは無視する */
export interface MockHints {
  topic?: string;
  side?: Side;
  team?: TeamKey;
  part?: FormatPart;
  exchangeIndex?: number;
  lastQuestion?: string;
  evidenceIds?: string[];
  opponentEvidenceIds?: string[];
  seed?: string;
  maxChars?: number;
}

export interface AgentInvocation {
  kind: InvocationKind;
  agent: AgentConfig;
  matchId: string;
  /** ログ用ラベル（"teamA/prep" など） */
  label: string;
  instructions: string;
  /** エージェントの作業ディレクトリ（cwd） */
  workspaceDir: string;
  /** Web ツールの許可。false のとき CLI の権限フラグで禁止する */
  allowWeb: boolean;
  /** ファイル操作系ツールが必要か（発言生成などテキストのみのタスクでは false） */
  needsFileTools: boolean;
  timeoutMs: number;
  mockHints?: MockHints;
}

export interface ToolUsageRecord {
  name: string;
  count: number;
}

export interface AgentResult {
  output: string;
  toolUsage: ToolUsageRecord[];
  raw?: unknown;
  durationMs: number;
}

export interface AgentAdapter {
  readonly provider: string;
  invoke(inv: AgentInvocation): Promise<AgentResult>;
}

export function addToolUsage(map: Map<string, number>, name: string): void {
  map.set(name, (map.get(name) ?? 0) + 1);
}

export function toolUsageFromMap(map: Map<string, number>): ToolUsageRecord[] {
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

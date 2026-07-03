import type { AgentConfig, FormatPart, Lang, Side, TeamKey } from "@debate/shared";

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

/** Hints for the mock adapter to produce plausible content. Real CLI adapters ignore these. */
export interface MockHints {
  topic?: string;
  side?: Side;
  team?: TeamKey;
  part?: FormatPart;
  lang?: Lang;
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
  /** Label for logging (e.g. "teamA/prep"). */
  label: string;
  instructions: string;
  /** The agent's working directory (cwd). */
  workspaceDir: string;
  /** Whether web tools are allowed. When false, forbidden via the CLI's permission flags. */
  allowWeb: boolean;
  /** Whether file-editing tools are needed (false for text-only tasks like speech generation). */
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

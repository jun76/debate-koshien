/** Team key. A/B are the team slots the user forms; the affirmative/negative side is assigned in the match config. */
export type TeamKey = "A" | "B";
export type Side = "affirmative" | "negative";

export type Provider = "mock" | "claude" | "codex" | "opencode";

export interface AgentConfig {
  id: string;
  name: string;
  provider: Provider;
  /** Provider-specific model (falls back to the CLI default when omitted). */
  model?: string;
  /** Reasoning mode (claude: effort / codex: reasoning effort / opencode: variant). */
  reasoningEffort?: string;
  avatarId?: string;
}

export type TeamMode = "council" | "roles";

/** Roles for the role-division mode. */
export type MemberRole =
  | "researcher"
  | "constructive"
  | "questioner"
  | "rebuttal"
  | "strategist";

export interface TeamConfig {
  name: string;
  mode: TeamMode;
  members: AgentConfig[];
  /** Captain of a council team (member ID). Defaults to the first member. */
  captainId?: string;
  /** Member ID -> role, for the role-division mode. */
  roles?: Record<string, MemberRole>;
}

export interface MatchLimits {
  /** Max agent invocations per team during the preparation phase. */
  prepMaxCalls: number;
  /** Retries allowed to fix a malformed handout artifact. */
  fixRetries: number;
  /** Retries to regenerate a speech that exceeds the character limit. */
  regenerateRetries: number;
}

export interface MatchConfig {
  id: string;
  topic: string;
  createdAt: string;
  /** Which team is on the affirmative side. */
  affirmative: TeamKey;
  teams: Record<TeamKey, TeamConfig>;
  judges: AgentConfig[];
  reviewer: AgentConfig;
  formatId: string;
  /** Whether to synthesize audio (auto-disabled if piper-plus is not set up). */
  tts: boolean;
  /** Whether to advance phases automatically. */
  autoAdvance: boolean;
  limits: MatchLimits;
}

export type Phase =
  | "setup"
  | "preparing"
  | "sealed"
  | "debating"
  | "judging"
  | "reviewing"
  | "finished"
  | "aborted"
  | "error";

export interface MatchState {
  phase: Phase;
  updatedAt: string;
  /** Fine-grained progress text shown while running. */
  progress?: string;
  error?: string;
}

/* ---------- Format definitions ---------- */

export type PartKind = "constructive" | "cross-examination" | "rebuttal";

export interface FormatPart {
  id: string;
  label: string;
  side: Side;
  kind: PartKind;
  /** Character limit for constructive / rebuttal parts. */
  maxChars?: number;
  /** Number of question-answer exchanges for a cross-examination part. */
  maxExchanges?: number;
  /** Character limit per single cross-examination utterance. */
  maxCharsPerUtterance?: number;
}

export interface FormatDefinition {
  id: string;
  name: string;
  description: string;
  parts: FormatPart[];
}

/* ---------- Evidence & handout ---------- */

export interface EvidenceSource {
  title: string;
  url?: string;
  publisher?: string;
  publishedAt?: string;
}

export interface EvidenceEntry {
  id: string;
  claim: string;
  quote: string;
  source: EvidenceSource;
  accessedAt?: string;
}

export interface SealManifestFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface Seal {
  team: TeamKey;
  files: SealManifestFile[];
  rootHash: string;
  sealedAt: string;
}

/* ---------- Match log events ---------- */

export type WarningKind =
  | "unknown-evidence"
  | "over-length"
  | "no-citation"
  | "web-tool-used"
  | "hash-mismatch"
  | "generation-error";

export interface SpeechWarning {
  kind: WarningKind;
  detail: string;
}

export type SpeechEventKind = "constructive" | "rebuttal" | "question" | "answer";

export interface BaseEvent {
  /** Sequence number; matches the line number in debate.jsonl. */
  seq: number;
  at: string;
}

export interface PhaseEvent extends BaseEvent {
  type: "phase";
  phase: Phase;
  detail?: string;
}

export interface PrepEvent extends BaseEvent {
  type: "prep";
  team: TeamKey;
  status: string;
}

export interface SealEvent extends BaseEvent {
  type: "seal";
  team: TeamKey;
  rootHash: string;
  fileCount: number;
}

export interface HashCheckEvent extends BaseEvent {
  type: "hash-check";
  team: TeamKey;
  when: "debate-start" | "judging-start";
  ok: boolean;
  detail?: string;
}

export interface SpeechEvent extends BaseEvent {
  type: "speech";
  id: string;
  kind: SpeechEventKind;
  partId: string;
  partLabel: string;
  exchangeIndex?: number;
  side: Side;
  team: TeamKey;
  speakerId: string;
  speakerName: string;
  avatarId?: string;
  text: string;
  chars: number;
  citations: string[];
  warnings: SpeechWarning[];
}

export interface DeliberationEvent extends BaseEvent {
  type: "deliberation";
  team: TeamKey;
  partId: string;
  memberId: string;
  memberName: string;
  label: string;
  text: string;
}

export interface WarningEvent extends BaseEvent {
  type: "warning";
  team?: TeamKey;
  kind: WarningKind;
  detail: string;
}

export interface AudioEvent extends BaseEvent {
  type: "audio";
  /** The SpeechEvent.id this audio belongs to. */
  refId: string;
  file: string;
  durationMs: number;
}

export interface VoteEvent extends BaseEvent {
  type: "vote";
  judgeId: string;
  judgeName: string;
  avatarId?: string;
  vote: Side;
}

export interface ResultEvent extends BaseEvent {
  type: "result";
  winner: Side;
  winnerTeam: TeamKey;
  votes: Record<Side, number>;
}

export interface ReviewReadyEvent extends BaseEvent {
  type: "review-ready";
}

export type MatchEvent =
  | PhaseEvent
  | PrepEvent
  | SealEvent
  | HashCheckEvent
  | SpeechEvent
  | DeliberationEvent
  | WarningEvent
  | AudioEvent
  | VoteEvent
  | ResultEvent
  | ReviewReadyEvent;

/* ---------- Judging ---------- */

export interface Verdict {
  judgeId: string;
  judgeName: string;
  vote: Side;
  decisiveIssues: string[];
  speechEvaluations: { partId: string; comment: string }[];
  evidenceAssessment: { evidenceId: string; reliability: string; comment: string }[];
  violations: { type: string; partId?: string; detail: string }[];
  communication: { clarity: string; responsiveness: string; comment: string };
  reasoning: string;
}

/* ---------- Post-match review ---------- */

export interface Review {
  decisiveIssues: string[];
  turningPoints: string[];
  strongEvidence: { evidenceId: string; comment: string }[];
  weakEvidence: { evidenceId: string; comment: string }[];
  effectiveRebuttals: string[];
  suspectedOutOfHandout: string[];
  judgeDifferences: string;
  preparationComparison: string;
  teamOperationComparison: string;
  improvements: Record<TeamKey, string[]>;
}

/* ---------- Avatars ---------- */

export interface AvatarItemLayer {
  file: string;
  slot: string;
  x: number;
  y: number;
  scale: number;
  visible: boolean;
}

export interface AvatarInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  /** URL paths (/assets/avatars/...). */
  layers: {
    backHair: string;
    frontHair: string;
    expressions: Record<string, string>;
    items: AvatarItemLayer[];
  };
}

/* ---------- API responses ---------- */

export interface MatchSummary {
  id: string;
  topic: string;
  createdAt: string;
  phase: Phase;
}

export interface HandoutResponse {
  team: TeamKey;
  handout: string;
  evidence: EvidenceEntry[];
  seal?: Seal;
}

export interface MatchDetail {
  config: MatchConfig;
  state: MatchState;
  events: MatchEvent[];
  seals: Partial<Record<TeamKey, Seal>>;
  verdicts: Verdict[];
  review?: Review;
  ttsAvailable: boolean;
}

export function sideOfTeam(config: MatchConfig, team: TeamKey): Side {
  return config.affirmative === team ? "affirmative" : "negative";
}

export function teamOfSide(config: MatchConfig, side: Side): TeamKey {
  if (side === "affirmative") return config.affirmative;
  return config.affirmative === "A" ? "B" : "A";
}

export const SIDE_LABEL: Record<Side, string> = {
  affirmative: "肯定側",
  negative: "否定側",
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  researcher: "調査担当",
  constructive: "立論担当",
  questioner: "質疑担当",
  rebuttal: "反駁担当",
  strategist: "戦略統括",
};

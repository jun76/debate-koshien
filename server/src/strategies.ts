import fs from "node:fs";
import path from "node:path";
import {
  countChars,
  truncateChars,
  type AgentConfig,
  type EvidenceEntry,
  type FormatDefinition,
  type FormatPart,
  type MatchConfig,
  type MemberRole,
  type Side,
  type SpeechEvent,
  type TeamKey,
} from "@debate/shared";
import { invokeAgent, type InvocationKind, type MockHints, type ToolUsageRecord } from "./adapters/index.js";
import { parseEvidence } from "./checks.js";
import { matchPaths } from "./paths.js";
import {
  answerPrompt,
  draftNote,
  mergePrompt,
  prepCompilePrompt,
  prepFixPrompt,
  prepResearchPrompt,
  questionPrompt,
  regeneratePrompt,
  speechPrompt,
  strategistReviewPrompt,
  type SpeechContext,
} from "./prompts.js";
import { appendEvent, ensureDir, updateThinking } from "./store.js";

const PREP_TIMEOUT_MS = 20 * 60_000;
const SPEECH_TIMEOUT_MS = 10 * 60_000;

export class AbortError extends Error {}

export interface RunControl {
  matchId: string;
  checkAborted(): void;
}

function captainOf(config: MatchConfig, team: TeamKey): AgentConfig {
  const t = config.teams[team];
  return t.members.find((m) => m.id === t.captainId) ?? t.members[0];
}

function memberByRole(config: MatchConfig, team: TeamKey, role: MemberRole): AgentConfig | undefined {
  const t = config.teams[team];
  if (!t.roles) return undefined;
  const id = Object.entries(t.roles).find(([, r]) => r === role)?.[0];
  return t.members.find((m) => m.id === id);
}

/* ---------- 準備フェーズ ---------- */

export interface PrepResult {
  handoutMd: string;
  evidence: EvidenceEntry[];
}

export async function prepareTeamHandout(opts: {
  config: MatchConfig;
  team: TeamKey;
  side: Side;
  format: FormatDefinition;
  ctl: RunControl;
  fixRetries: number;
  emitStatus: (status: string) => void;
}): Promise<PrepResult> {
  const { config, team, side, format, ctl } = opts;
  const teamCfg = config.teams[team];
  const workspace = matchPaths.prepWorkspace(config.id, team);
  ensureDir(workspace);

  const mockHints: MockHints = { topic: config.topic, side, team };
  const thinkingKey = `team-${team}`;
  const think = (agents: AgentConfig[], label: string) =>
    updateThinking(config.id, thinkingKey, { scope: "team", team, agentIds: agents.map((a) => a.id), label });

  try {
  // 調査担当を決める（役割分担制: researcher 指定者 / 合議制: 全メンバー）
  let notes: string[] = [];
  if (teamCfg.members.length > 1) {
    const researchers =
      teamCfg.mode === "roles"
        ? teamCfg.members.filter((m) => teamCfg.roles?.[m.id] === "researcher")
        : teamCfg.members;
    const targets = researchers.length > 0 ? researchers : teamCfg.members;
    opts.emitStatus(`調査中（${targets.map((m) => m.name).join("、")}）`);
    think(targets, "調査中");
    notes = await Promise.all(
      targets.map(async (m) => {
        ctl.checkAborted();
        const res = await invokeAgent({
          kind: "prep-research",
          agent: m,
          matchId: config.id,
          label: `team${team}-${m.name}`,
          instructions: prepResearchPrompt({ topic: config.topic, side, memberName: m.name, format }),
          workspaceDir: workspace,
          allowWeb: true,
          needsFileTools: true,
          timeoutMs: PREP_TIMEOUT_MS,
          mockHints,
        });
        return res.output;
      }),
    );
  }

  // ハンドアウトの編纂担当（合議制: captain / 役割分担制: 調査担当 → いなければ captain）
  const compiler =
    teamCfg.mode === "roles"
      ? (memberByRole(config, team, "researcher") ?? captainOf(config, team))
      : captainOf(config, team);

  ctl.checkAborted();
  opts.emitStatus(`ハンドアウト作成中（${compiler.name}）`);
  think([compiler], "ハンドアウト作成中");
  await invokeAgent({
    kind: "prep-compile",
    agent: compiler,
    matchId: config.id,
    label: `team${team}-${compiler.name}`,
    instructions: prepCompilePrompt({ topic: config.topic, side, format, researchNotes: notes }),
    workspaceDir: workspace,
    allowWeb: true,
    needsFileTools: true,
    timeoutMs: PREP_TIMEOUT_MS,
    mockHints,
  });

  // 成果物の検証と修正ループ
  for (let attempt = 0; ; attempt++) {
    ctl.checkAborted();
    const errors = validateWorkspace(workspace, side);
    if (errors.length === 0) break;
    if (attempt >= opts.fixRetries) {
      throw new Error(`チーム${team} のハンドアウトが規定を満たさない: ${errors.join(" / ")}`);
    }
    opts.emitStatus(`成果物の不備を修正中（${errors.length}件）`);
    think([compiler], "成果物を修正中");
    await invokeAgent({
      kind: "prep-fix",
      agent: compiler,
      matchId: config.id,
      label: `team${team}-${compiler.name}`,
      instructions: prepFixPrompt(errors),
      workspaceDir: workspace,
      allowWeb: true,
      needsFileTools: true,
      timeoutMs: PREP_TIMEOUT_MS,
      mockHints,
    });
  }

  const handoutMd = fs.readFileSync(path.join(workspace, "handout.md"), "utf8");
  const { evidence } = parseEvidence(fs.readFileSync(path.join(workspace, "evidence.json"), "utf8"), side);
  return { handoutMd, evidence };
  } finally {
    updateThinking(config.id, thinkingKey, null);
  }
}

function validateWorkspace(workspace: string, side: Side): string[] {
  const errors: string[] = [];
  const evidenceFile = path.join(workspace, "evidence.json");
  const handoutFile = path.join(workspace, "handout.md");
  if (!fs.existsSync(evidenceFile)) {
    errors.push("evidence.json が存在しない");
  } else {
    errors.push(...parseEvidence(fs.readFileSync(evidenceFile, "utf8"), side).errors);
  }
  if (!fs.existsSync(handoutFile)) {
    errors.push("handout.md が存在しない");
  } else if (fs.readFileSync(handoutFile, "utf8").trim().length < 50) {
    errors.push("handout.md の内容が薄すぎる（論点構成と証拠の位置づけを記述すること）");
  }
  return errors;
}

/* ---------- ディベート本編の発言生成 ---------- */

export interface UtteranceRequest {
  config: MatchConfig;
  team: TeamKey;
  side: Side;
  format: FormatDefinition;
  part: FormatPart;
  kind: "constructive" | "rebuttal" | "question" | "answer";
  exchangeIndex?: number;
  lastQuestion?: string;
  publicLog: SpeechEvent[];
  handoutMd: string;
  evidence: EvidenceEntry[];
  opponentEvidence: EvidenceEntry[];
  /** 封印済みスナップショット（エージェントの cwd。原本には書き込ませない） */
  workspaceDir: string;
  ctl: RunControl;
  regenerateRetries: number;
}

export interface UtteranceResult {
  text: string;
  speaker: AgentConfig;
  toolUsage: ToolUsageRecord[];
  /** 上限超過で切り詰めた場合の元の文字数 */
  overLengthOriginal?: number;
}

export async function produceUtterance(req: UtteranceRequest): Promise<UtteranceResult> {
  const teamCfg = req.config.teams[req.team];
  const ctx: SpeechContext = {
    topic: req.config.topic,
    side: req.side,
    format: req.format,
    part: req.part,
    handoutMd: req.handoutMd,
    evidence: req.evidence,
    publicLog: req.publicLog,
    exchangeIndex: req.exchangeIndex,
    lastQuestion: req.lastQuestion,
  };
  const maxChars =
    (req.kind === "question" || req.kind === "answer" ? req.part.maxCharsPerUtterance : req.part.maxChars) ?? 2000;

  const mockHints: MockHints = {
    topic: req.config.topic,
    side: req.side,
    team: req.team,
    part: req.part,
    exchangeIndex: req.exchangeIndex,
    lastQuestion: req.lastQuestion,
    evidenceIds: req.evidence.map((e) => e.id),
    opponentEvidenceIds: req.opponentEvidence.map((e) => e.id),
    maxChars,
  };

  const basePrompt =
    req.kind === "question" ? questionPrompt(ctx) : req.kind === "answer" ? answerPrompt(ctx) : speechPrompt(ctx);

  const invoke = (kind: InvocationKind, agent: AgentConfig, instructions: string) => {
    req.ctl.checkAborted();
    return invokeAgent({
      kind,
      agent,
      matchId: req.config.id,
      label: `team${req.team}-${agent.name}`,
      instructions,
      workspaceDir: req.workspaceDir,
      allowWeb: false,
      needsFileTools: false,
      timeoutMs: SPEECH_TIMEOUT_MS,
      mockHints,
    });
  };

  const thinkingKey = `team-${req.team}`;
  const think = (agents: AgentConfig[], label: string) =>
    updateThinking(req.config.id, thinkingKey, {
      scope: "team",
      team: req.team,
      agentIds: agents.map((a) => a.id),
      label,
    });

  const allUsage: ToolUsageRecord[] = [];
  const emitDeliberation = (member: AgentConfig, label: string, text: string) => {
    appendEvent(req.config.id, {
      type: "deliberation",
      team: req.team,
      partId: req.part.id,
      memberId: member.id,
      memberName: member.name,
      label,
      text,
    });
  };

  let speaker: AgentConfig;
  let text: string;

  const isQa = req.kind === "question" || req.kind === "answer";
  const invokeKind: InvocationKind =
    req.kind === "question" ? "question" : req.kind === "answer" ? "answer" : "speech";

  try {
  if (teamCfg.members.length === 1) {
    speaker = teamCfg.members[0];
    think([speaker], `${req.part.label}を思考中`);
    const res = await invoke(invokeKind, speaker, basePrompt);
    allUsage.push(...res.toolUsage);
    text = res.output;
  } else if (teamCfg.mode === "council") {
    const captain = captainOf(req.config, req.team);
    if (isQa) {
      // 質疑はテンポ重視で captain が直接応答する
      speaker = captain;
      think([captain], req.kind === "question" ? "質問を思考中" : "応答を思考中");
      const res = await invoke(invokeKind, captain, basePrompt);
      allUsage.push(...res.toolUsage);
      text = res.output;
    } else {
      think(teamCfg.members, "草案を作成中");
      const drafts = await Promise.all(
        teamCfg.members.map(async (m) => {
          const res = await invoke("draft", m, basePrompt + draftNote(m.name));
          allUsage.push(...res.toolUsage);
          emitDeliberation(m, "草案", res.output);
          return { memberName: m.name, text: res.output };
        }),
      );
      speaker = captain;
      think([captain], "チーム発言を統合中");
      const res = await invoke("merge", captain, mergePrompt({ ctx, drafts, taskLabel: req.part.label, maxChars }));
      allUsage.push(...res.toolUsage);
      text = res.output;
    }
  } else {
    // 役割分担制
    const roleFor: MemberRole = req.kind === "constructive" ? "constructive" : req.kind === "rebuttal" ? "rebuttal" : req.kind === "question" ? "questioner" : "constructive";
    const member = memberByRole(req.config, req.team, roleFor) ?? captainOf(req.config, req.team);
    speaker = member;
    think([member], `${req.part.label}を思考中`);
    const res = await invoke(invokeKind, member, basePrompt);
    allUsage.push(...res.toolUsage);
    text = res.output;

    const strategist = memberByRole(req.config, req.team, "strategist");
    if (strategist && !isQa) {
      emitDeliberation(member, "担当者案", text);
      think([strategist], "最終確認中");
      const reviewed = await invoke(
        "merge",
        strategist,
        strategistReviewPrompt({ ctx, draft: text, taskLabel: req.part.label, maxChars }),
      );
      allUsage.push(...reviewed.toolUsage);
      speaker = strategist;
      text = reviewed.output;
    }
  }

  // 文字数上限: 再生成 → それでも超過なら切り詰め
  let overLengthOriginal: number | undefined;
  for (let i = 0; i < req.regenerateRetries && countChars(text) > maxChars; i++) {
    think([speaker], "文字数上限内に再生成中");
    const res = await invoke("regenerate", speaker, regeneratePrompt(text, maxChars));
    allUsage.push(...res.toolUsage);
    if (res.output.trim()) text = res.output;
  }
  if (countChars(text) > maxChars) {
    overLengthOriginal = countChars(text);
    text = truncateChars(text, maxChars);
  }

  return { text: text.trim(), speaker, toolUsage: allUsage, overLengthOriginal };
  } finally {
    updateThinking(req.config.id, thinkingKey, null);
  }
}

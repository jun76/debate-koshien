import fs from "node:fs";
import path from "node:path";
import {
  countChars,
  partLabel,
  truncateChars,
  type AgentConfig,
  type EvidenceEntry,
  type FormatDefinition,
  type FormatPart,
  type Lang,
  type MatchConfig,
  type MemberRole,
  type Side,
  type SpeechEvent,
  type TeamKey,
} from "@debate/shared";
import { invokeAgent, type InvocationKind, type MockHints, type ToolUsageRecord } from "./adapters/index.js";
import { parseEvidence } from "./checks.js";
import { serverStrings } from "./i18n.js";
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

/* ---------- Preparation phase ---------- */

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
  const lang = config.lang;
  const t = serverStrings(lang);
  const teamCfg = config.teams[team];
  const workspace = matchPaths.prepWorkspace(config.id, team);
  ensureDir(workspace);

  const mockHints: MockHints = { topic: config.topic, side, team, lang };
  const thinkingKey = `team-${team}`;
  const think = (agents: AgentConfig[], label: string) =>
    updateThinking(config.id, thinkingKey, { scope: "team", team, agentIds: agents.map((a) => a.id), label });

  try {
    // Decide who researches (role-division: the researcher / council: all members).
    let notes: string[] = [];
    if (teamCfg.members.length > 1) {
      const researchers =
        teamCfg.mode === "roles"
          ? teamCfg.members.filter((m) => teamCfg.roles?.[m.id] === "researcher")
          : teamCfg.members;
      const targets = researchers.length > 0 ? researchers : teamCfg.members;
      opts.emitStatus(t.researching(targets.map((m) => m.name).join("、")));
      think(targets, t.thinkResearching);
      notes = await Promise.all(
        targets.map(async (m) => {
          ctl.checkAborted();
          const res = await invokeAgent({
            kind: "prep-research",
            agent: m,
            matchId: config.id,
            label: `team${team}-${m.name}`,
            instructions: prepResearchPrompt({ topic: config.topic, side, memberName: m.name, format, lang }),
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

    // Handout compiler (council: captain / role-division: researcher, else captain).
    const compiler =
      teamCfg.mode === "roles"
        ? (memberByRole(config, team, "researcher") ?? captainOf(config, team))
        : captainOf(config, team);

    ctl.checkAborted();
    opts.emitStatus(t.compiling(compiler.name));
    think([compiler], t.thinkCompiling);
    await invokeAgent({
      kind: "prep-compile",
      agent: compiler,
      matchId: config.id,
      label: `team${team}-${compiler.name}`,
      instructions: prepCompilePrompt({ topic: config.topic, side, format, researchNotes: notes, lang }),
      workspaceDir: workspace,
      allowWeb: true,
      needsFileTools: true,
      timeoutMs: PREP_TIMEOUT_MS,
      mockHints,
    });

    // Validate the artifacts and loop on fixes.
    for (let attempt = 0; ; attempt++) {
      ctl.checkAborted();
      const errors = validateWorkspace(workspace, side, lang);
      if (errors.length === 0) break;
      if (attempt >= opts.fixRetries) {
        throw new Error(t.handoutInvalid(team, errors.join(" / ")));
      }
      opts.emitStatus(t.fixingArtifacts(errors.length));
      think([compiler], t.thinkFixing);
      await invokeAgent({
        kind: "prep-fix",
        agent: compiler,
        matchId: config.id,
        label: `team${team}-${compiler.name}`,
        instructions: prepFixPrompt(errors, lang),
        workspaceDir: workspace,
        allowWeb: true,
        needsFileTools: true,
        timeoutMs: PREP_TIMEOUT_MS,
        mockHints,
      });
    }

    const handoutMd = fs.readFileSync(path.join(workspace, "handout.md"), "utf8");
    const { evidence } = parseEvidence(fs.readFileSync(path.join(workspace, "evidence.json"), "utf8"), side, lang);
    return { handoutMd, evidence };
  } finally {
    updateThinking(config.id, thinkingKey, null);
  }
}

function validateWorkspace(workspace: string, side: Side, lang: Lang): string[] {
  const t = serverStrings(lang);
  const errors: string[] = [];
  const evidenceFile = path.join(workspace, "evidence.json");
  const handoutFile = path.join(workspace, "handout.md");
  if (!fs.existsSync(evidenceFile)) {
    errors.push(t.handoutMissingEvidence);
  } else {
    errors.push(...parseEvidence(fs.readFileSync(evidenceFile, "utf8"), side, lang).errors);
  }
  if (!fs.existsSync(handoutFile)) {
    errors.push(t.handoutMissingFile);
  } else if (fs.readFileSync(handoutFile, "utf8").trim().length < 50) {
    errors.push(t.handoutTooThin);
  }
  return errors;
}

/* ---------- Speech generation for the debate proper ---------- */

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
  /** Sealed snapshot (the agent's cwd; the original is never written to). */
  workspaceDir: string;
  ctl: RunControl;
  regenerateRetries: number;
}

export interface UtteranceResult {
  text: string;
  speaker: AgentConfig;
  toolUsage: ToolUsageRecord[];
  /** Original character count when truncated for exceeding the limit. */
  overLengthOriginal?: number;
}

export async function produceUtterance(req: UtteranceRequest): Promise<UtteranceResult> {
  const lang = req.config.lang;
  const t = serverStrings(lang);
  const teamCfg = req.config.teams[req.team];
  const label = partLabel(req.part.id, lang);
  const ctx: SpeechContext = {
    topic: req.config.topic,
    side: req.side,
    format: req.format,
    part: req.part,
    handoutMd: req.handoutMd,
    evidence: req.evidence,
    publicLog: req.publicLog,
    lang,
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
    lang,
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
  const think = (agents: AgentConfig[], thinkLabel: string) =>
    updateThinking(req.config.id, thinkingKey, {
      scope: "team",
      team: req.team,
      agentIds: agents.map((a) => a.id),
      label: thinkLabel,
    });

  const allUsage: ToolUsageRecord[] = [];
  const emitDeliberation = (member: AgentConfig, deliberationLabel: string, text: string) => {
    appendEvent(req.config.id, {
      type: "deliberation",
      team: req.team,
      partId: req.part.id,
      memberId: member.id,
      memberName: member.name,
      label: deliberationLabel,
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
      think([speaker], t.thinkPart(label));
      const res = await invoke(invokeKind, speaker, basePrompt);
      allUsage.push(...res.toolUsage);
      text = res.output;
    } else if (teamCfg.mode === "council") {
      const captain = captainOf(req.config, req.team);
      if (isQa) {
        // Cross-examination is answered directly by the captain for pace.
        speaker = captain;
        think([captain], req.kind === "question" ? t.thinkQuestion : t.thinkAnswer);
        const res = await invoke(invokeKind, captain, basePrompt);
        allUsage.push(...res.toolUsage);
        text = res.output;
      } else {
        think(teamCfg.members, t.thinkDrafting);
        const drafts = await Promise.all(
          teamCfg.members.map(async (m) => {
            const res = await invoke("draft", m, basePrompt + draftNote(m.name, lang));
            allUsage.push(...res.toolUsage);
            emitDeliberation(m, t.labelDraft, res.output);
            return { memberName: m.name, text: res.output };
          }),
        );
        speaker = captain;
        think([captain], t.thinkMerging);
        const res = await invoke("merge", captain, mergePrompt({ ctx, drafts, taskLabel: label, maxChars }));
        allUsage.push(...res.toolUsage);
        text = res.output;
      }
    } else {
      // Role-division mode.
      const roleFor: MemberRole = req.kind === "constructive" ? "constructive" : req.kind === "rebuttal" ? "rebuttal" : req.kind === "question" ? "questioner" : "constructive";
      const member = memberByRole(req.config, req.team, roleFor) ?? captainOf(req.config, req.team);
      speaker = member;
      think([member], t.thinkPart(label));
      const res = await invoke(invokeKind, member, basePrompt);
      allUsage.push(...res.toolUsage);
      text = res.output;

      const strategist = memberByRole(req.config, req.team, "strategist");
      if (strategist && !isQa) {
        emitDeliberation(member, t.labelAssigneeDraft, text);
        think([strategist], t.thinkFinalCheck);
        const reviewed = await invoke(
          "merge",
          strategist,
          strategistReviewPrompt({ ctx, draft: text, taskLabel: label, maxChars }),
        );
        allUsage.push(...reviewed.toolUsage);
        speaker = strategist;
        text = reviewed.output;
      }
    }

    // Character limit: regenerate, then truncate if it still exceeds.
    let overLengthOriginal: number | undefined;
    for (let i = 0; i < req.regenerateRetries && countChars(text) > maxChars; i++) {
      think([speaker], t.thinkRegenerate);
      const res = await invoke("regenerate", speaker, regeneratePrompt(text, maxChars, lang));
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

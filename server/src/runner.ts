import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getFormat,
  partLabel,
  sideOfTeam,
  teamOfSide,
  type EvidenceEntry,
  type FormatPart,
  type MatchConfig,
  type Review,
  type Side,
  type SpeechEvent,
  type TeamKey,
  type Verdict,
} from "@debate/shared";
import { invokeAgent } from "./adapters/index.js";
import { checkSpeech, detectWebToolUsage, parseEvidence } from "./checks.js";
import { serverStrings } from "./i18n.js";
import { sealDirectory, verifySeal, type VerifyResult } from "./hash.js";
import { matchPaths } from "./paths.js";
import { judgePrompt, renderPublicLog, reviewPrompt } from "./prompts.js";
import {
  appendEvent,
  ensureDir,
  getConfig,
  getSeal,
  getState,
  getVerdicts,
  readEvents,
  saveReview,
  saveSeal,
  saveVerdict,
  setPhase,
  setProgress,
  updateThinking,
} from "./store.js";
import { AbortError, prepareTeamHandout, produceUtterance, type RunControl } from "./strategies.js";
import { enqueueSynthesis, speakableText, ttsAvailable } from "./tts.js";

const JUDGE_TIMEOUT_MS = 15 * 60_000;

interface Running {
  aborted: boolean;
}

const running = new Map<string, Running>();

/** Outstanding TTS jobs per match. Held so exhibition mode can wait for "all audio ready". */
const ttsJobs = new Map<string, Promise<void>[]>();

export function isRunning(matchId: string): boolean {
  return running.has(matchId);
}

export function abortMatch(matchId: string): boolean {
  const r = running.get(matchId);
  if (!r) return false;
  r.aborted = true;
  return true;
}

/** Advance the match from its current phase (runs asynchronously; returns immediately). */
export function startMatch(matchId: string): { ok: boolean; message?: string } {
  const config = getConfig(matchId);
  const t = serverStrings(config?.lang ?? "ja");
  if (running.has(matchId)) return { ok: false, message: t.alreadyRunning };
  if (!config) return { ok: false, message: t.matchNotExist };
  let phase = getState(matchId).phase;
  if (phase === "finished" || phase === "aborted") return { ok: false, message: t.cannotAdvance(phase) };
  if (phase === "error") {
    phase = getSeal(matchId, "A") && getSeal(matchId, "B") ? "sealed" : "setup";
    setPhase(matchId, phase, t.retryFromError);
  }

  const r: Running = { aborted: false };
  running.set(matchId, r);
  const ctl: RunControl = {
    matchId,
    checkAborted() {
      if (r.aborted) throw new AbortError("aborted");
    },
  };

  void run(config, ctl)
    .catch((err) => {
      if (!getConfig(matchId)) return;
      if (err instanceof AbortError) {
        setPhase(matchId, "aborted");
      } else {
        console.error(`[match ${matchId}]`, err);
        setPhase(matchId, "error", String(err instanceof Error ? err.message : err));
      }
    })
    .finally(() => {
      running.delete(matchId);
      ttsJobs.delete(matchId);
    });

  return { ok: true };
}

async function run(config: MatchConfig, ctl: RunControl): Promise<void> {
  let phase = getState(config.id).phase;
  if (phase === "setup" || phase === "preparing") {
    await runPrep(config, ctl);
    phase = "sealed";
    if (!config.autoAdvance) return;
  }
  if (phase === "sealed" || phase === "debating") {
    await runDebate(config, ctl);
    phase = "judging";
  }
  if (phase === "judging") {
    await runJudging(config, ctl);
    phase = "reviewing";
  }
  if (phase === "reviewing") {
    await runReview(config, ctl);
  }
}

/* ---------- Preparation phase ---------- */

async function runPrep(config: MatchConfig, ctl: RunControl): Promise<void> {
  const t = serverStrings(config.lang);
  const format = getFormat(config.formatId);
  setPhase(config.id, "preparing");

  const teams: TeamKey[] = ["A", "B"];
  await Promise.all(
    teams.map(async (team) => {
      const side = sideOfTeam(config, team);
      const emitStatus = (status: string) => {
        appendEvent(config.id, { type: "prep", team, status });
      };
      emitStatus(t.prepStart(side));
      await prepareTeamHandout({
        config,
        team,
        side,
        format,
        ctl,
        fixRetries: config.limits.fixRetries,
        emitStatus,
      });
      ctl.checkAborted();

      // Copy the artifacts into the seal directory and seal them.
      const workspace = matchPaths.prepWorkspace(config.id, team);
      const handoutDir = matchPaths.handoutDir(config.id, team);
      ensureDir(handoutDir);
      for (const f of ["handout.md", "evidence.json"]) {
        fs.copyFileSync(path.join(workspace, f), path.join(handoutDir, f));
      }
      const seal = sealDirectory(handoutDir, team);
      saveSeal(config.id, seal);
      appendEvent(config.id, { type: "seal", team, rootHash: seal.rootHash, fileCount: seal.files.length });
      emitStatus(t.handoutSealed);
    }),
  );

  setPhase(config.id, "sealed", t.bothSealed);
}

/* ---------- Debate proper ---------- */

interface TeamMaterial {
  handoutMd: string;
  evidence: EvidenceEntry[];
  snapshotDir: string;
}

function loadSealedMaterial(config: MatchConfig, team: TeamKey): TeamMaterial {
  const handoutDir = matchPaths.handoutDir(config.id, team);
  const snapshotDir = matchPaths.sealedSnapshotDir(config.id, team);
  // Give the agent a copy of the sealed snapshot; never let it touch the original.
  ensureDir(snapshotDir);
  for (const f of ["handout.md", "evidence.json"]) {
    fs.copyFileSync(path.join(handoutDir, f), path.join(snapshotDir, f));
  }
  const handoutMd = fs.readFileSync(path.join(snapshotDir, "handout.md"), "utf8");
  const side = sideOfTeam(config, team);
  const { evidence } = parseEvidence(fs.readFileSync(path.join(snapshotDir, "evidence.json"), "utf8"), side, config.lang);
  return { handoutMd, evidence, snapshotDir };
}

/** Compose a human-readable detail string from a seal verification result. */
function formatSealDetail(config: MatchConfig, result: VerifyResult): string {
  const t = serverStrings(config.lang);
  if (result.ok) return "";
  if (result.diffs.length === 0) return t.rootMismatch;
  return result.diffs.map((d) => t.sealDiff(d)).join(", ");
}

function verifyTeamSeal(config: MatchConfig, team: TeamKey, when: "debate-start" | "judging-start"): void {
  const t = serverStrings(config.lang);
  const seal = getSeal(config.id, team);
  if (!seal) {
    appendEvent(config.id, { type: "hash-check", team, when, ok: false, detail: t.sealMissing });
    return;
  }
  const result = verifySeal(matchPaths.handoutDir(config.id, team), seal);
  const detail = formatSealDetail(config, result);
  appendEvent(config.id, { type: "hash-check", team, when, ok: result.ok, detail });
  if (!result.ok) {
    appendEvent(config.id, {
      type: "warning",
      team,
      kind: "hash-mismatch",
      detail: t.handoutTampered(team, detail),
    });
  }
}

function publicLogOf(matchId: string): SpeechEvent[] {
  return readEvents(matchId).filter((e): e is SpeechEvent => e.type === "speech");
}

async function runDebate(config: MatchConfig, ctl: RunControl): Promise<void> {
  const t = serverStrings(config.lang);
  const format = getFormat(config.formatId);
  if (getState(config.id).phase !== "debating") {
    setPhase(config.id, "debating");
    verifyTeamSeal(config, "A", "debate-start");
    verifyTeamSeal(config, "B", "debate-start");
  }

  const materials: Record<TeamKey, TeamMaterial> = {
    A: loadSealedMaterial(config, "A"),
    B: loadSealedMaterial(config, "B"),
  };

  for (const part of format.parts) {
    ctl.checkAborted();
    const label = partLabel(part.id, config.lang);
    const done = publicLogOf(config.id).filter((e) => e.partId === part.id);

    if (part.kind === "cross-examination") {
      const questionerTeam = teamOfSide(config, part.side);
      const answererTeam: TeamKey = questionerTeam === "A" ? "B" : "A";
      const max = part.maxExchanges ?? 3;
      let questions = done.filter((e) => e.kind === "question");
      let answers = done.filter((e) => e.kind === "answer");
      if (answers.length >= max) continue;

      for (let ex = answers.length; ex < max; ex++) {
        ctl.checkAborted();
        let questionText: string;
        if (questions.length > ex) {
          questionText = questions[ex].text;
        } else {
          setProgress(config.id, t.progressQuestion(label, ex + 1, max));
          questionText = (await emitUtterance(config, ctl, materials, {
            part,
            team: questionerTeam,
            kind: "question",
            exchangeIndex: ex,
          })).text;
        }
        setProgress(config.id, t.progressAnswer(label, ex + 1, max));
        await emitUtterance(config, ctl, materials, {
          part,
          team: answererTeam,
          kind: "answer",
          exchangeIndex: ex,
          lastQuestion: questionText,
        });
        questions = publicLogOf(config.id).filter((e) => e.partId === part.id && e.kind === "question");
        answers = publicLogOf(config.id).filter((e) => e.partId === part.id && e.kind === "answer");
      }
    } else {
      if (done.length > 0) continue;
      setProgress(config.id, t.progressGenerating(label));
      await emitUtterance(config, ctl, materials, {
        part,
        team: teamOfSide(config, part.side),
        kind: part.kind,
      });
    }
  }

  setPhase(config.id, "judging", t.allPartsDone);
}

async function emitUtterance(
  config: MatchConfig,
  ctl: RunControl,
  materials: Record<TeamKey, TeamMaterial>,
  opts: {
    part: FormatPart;
    team: TeamKey;
    kind: "constructive" | "rebuttal" | "question" | "answer";
    exchangeIndex?: number;
    lastQuestion?: string;
  },
): Promise<SpeechEvent> {
  const side = sideOfTeam(config, opts.team);
  const format = getFormat(config.formatId);
  const own = materials[opts.team];
  const opponent = materials[opts.team === "A" ? "B" : "A"];

  const result = await produceUtterance({
    config,
    team: opts.team,
    side,
    format,
    part: opts.part,
    kind: opts.kind,
    exchangeIndex: opts.exchangeIndex,
    lastQuestion: opts.lastQuestion,
    publicLog: publicLogOf(config.id),
    handoutMd: own.handoutMd,
    evidence: own.evidence,
    opponentEvidence: opponent.evidence,
    workspaceDir: own.snapshotDir,
    ctl,
    regenerateRetries: config.limits.regenerateRetries,
  });

  const webToolsUsed = detectWebToolUsage(result.toolUsage);
  const { citations, warnings } = checkSpeech({
    text: result.text,
    side,
    kind: opts.kind,
    part: opts.part,
    lang: config.lang,
    ownEvidence: own.evidence,
    opponentEvidence: opponent.evidence,
    overLengthOriginal: result.overLengthOriginal,
    webToolsUsed,
  });

  const ev = appendEvent(config.id, {
    type: "speech",
    id: randomUUID(),
    kind: opts.kind,
    partId: opts.part.id,
    partLabel: partLabel(opts.part.id, config.lang),
    exchangeIndex: opts.exchangeIndex,
    side,
    team: opts.team,
    speakerId: result.speaker.id,
    speakerName: result.speaker.name,
    avatarId: result.speaker.avatarId,
    text: result.text,
    chars: [...result.text].length,
    citations,
    warnings,
  }) as SpeechEvent;

  scheduleTts(config, ev);
  return ev;
}

/** After a speech is finalized, synthesize audio in the background and emit an audio event when done. */
function scheduleTts(config: MatchConfig, ev: SpeechEvent): void {
  if (!config.tts || !ttsAvailable(config.lang)) return;
  const audioDir = matchPaths.audioDir(config.id);
  const wavPath = path.join(audioDir, `${ev.id}.wav`);
  const job = enqueueSynthesis(speakableText(ev.text), wavPath, config.lang)
    .then((durationMs) => {
      if (durationMs === null) return;
      appendEvent(config.id, { type: "audio", refId: ev.id, file: `${ev.id}.wav`, durationMs });
    })
    .catch((err) => {
      console.error(`[tts ${config.id}]`, err);
    });
  const list = ttsJobs.get(config.id) ?? [];
  list.push(job);
  ttsJobs.set(config.id, list);
}

/* ---------- Judging ---------- */

function extractJsonObject(text: string): unknown | undefined {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // In case code fences or a preamble are mixed in, try from the first { to the last }.
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function normalizeVerdict(raw: unknown, judgeId: string, judgeName: string): Verdict | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (r.vote !== "affirmative" && r.vote !== "negative") return undefined;
  const comm = (r.communication ?? {}) as Record<string, unknown>;
  return {
    judgeId,
    judgeName,
    vote: r.vote as Side,
    decisiveIssues: asStringArray(r.decisiveIssues),
    speechEvaluations: Array.isArray(r.speechEvaluations)
      ? (r.speechEvaluations as { partId?: string; comment?: string }[]).map((e) => ({
          partId: String(e.partId ?? ""),
          comment: String(e.comment ?? ""),
        }))
      : [],
    evidenceAssessment: Array.isArray(r.evidenceAssessment)
      ? (r.evidenceAssessment as { evidenceId?: string; reliability?: string; comment?: string }[]).map((e) => ({
          evidenceId: String(e.evidenceId ?? ""),
          reliability: String(e.reliability ?? ""),
          comment: String(e.comment ?? ""),
        }))
      : [],
    violations: Array.isArray(r.violations)
      ? (r.violations as { type?: string; partId?: string; detail?: string }[]).map((v) => ({
          type: String(v.type ?? ""),
          partId: v.partId ? String(v.partId) : undefined,
          detail: String(v.detail ?? ""),
        }))
      : [],
    communication: {
      clarity: String(comm.clarity ?? ""),
      responsiveness: String(comm.responsiveness ?? ""),
      comment: String(comm.comment ?? ""),
    },
    reasoning: String(r.reasoning ?? ""),
  };
}

function collectWarningStrings(config: MatchConfig): string[] {
  const t = serverStrings(config.lang);
  const out: string[] = [];
  for (const ev of readEvents(config.id)) {
    if (ev.type === "speech") {
      for (const w of ev.warnings) out.push(t.warningLine(ev.partLabel, ev.side, w.detail));
    } else if (ev.type === "warning") {
      out.push(ev.detail);
    }
  }
  return out;
}

function collectHashCheckStrings(config: MatchConfig): string[] {
  const t = serverStrings(config.lang);
  return readEvents(config.id)
    .filter((e) => e.type === "hash-check")
    .map((e) => t.hashCheckLine(e.team, e.when, e.ok, e.detail ?? ""));
}

async function runJudging(config: MatchConfig, ctl: RunControl): Promise<void> {
  const t = serverStrings(config.lang);
  if (getVerdicts(config.id).length === 0) {
    verifyTeamSeal(config, "A", "judging-start");
    verifyTeamSeal(config, "B", "judging-start");
  }

  const format = getFormat(config.formatId);
  const affTeam = config.affirmative;
  const negTeam: TeamKey = affTeam === "A" ? "B" : "A";
  const aff = loadSealedMaterial(config, affTeam);
  const neg = loadSealedMaterial(config, negTeam);

  const prompt = judgePrompt({
    topic: config.topic,
    format,
    affirmativeHandout: aff.handoutMd,
    affirmativeEvidence: aff.evidence,
    negativeHandout: neg.handoutMd,
    negativeEvidence: neg.evidence,
    publicLog: publicLogOf(config.id),
    hashChecks: collectHashCheckStrings(config),
    warnings: collectWarningStrings(config),
    lang: config.lang,
  });

  const existing = new Set(getVerdicts(config.id).map((v) => v.judgeId));
  for (const judge of config.judges) {
    if (existing.has(judge.id)) continue;
    ctl.checkAborted();
    setProgress(config.id, t.judgeDeciding(judge.name));
    updateThinking(config.id, "judge", {
      scope: "judge",
      agentIds: [judge.id],
      label: t.thinkJudge,
    });
    const workspace = matchPaths.judgeWorkspace(config.id, judge.id);
    ensureDir(workspace);

    let verdict: Verdict | undefined;
    for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
      const res = await invokeAgent({
        kind: "judge",
        agent: judge,
        matchId: config.id,
        label: `judge-${judge.name}`,
        instructions: attempt === 0 ? prompt : `${prompt}${t.jsonRetrySuffix}`,
        workspaceDir: workspace,
        allowWeb: false,
        needsFileTools: false,
        timeoutMs: JUDGE_TIMEOUT_MS,
        mockHints: {
          topic: config.topic,
          lang: config.lang,
          seed: judge.id,
          evidenceIds: aff.evidence.map((e) => e.id),
          opponentEvidenceIds: neg.evidence.map((e) => e.id),
        },
      });
      verdict = normalizeVerdict(extractJsonObject(res.output), judge.id, judge.name);
    }
    updateThinking(config.id, "judge", null);
    if (!verdict) throw new Error(t.judgeParseError(judge.name));

    saveVerdict(config.id, verdict);
    appendEvent(config.id, {
      type: "vote",
      judgeId: judge.id,
      judgeName: judge.name,
      avatarId: judge.avatarId,
      vote: verdict.vote,
    });
  }

  const verdicts = getVerdicts(config.id);
  const affVotes = verdicts.filter((v) => v.vote === "affirmative").length;
  const negVotes = verdicts.length - affVotes;
  const winner: Side = affVotes > negVotes ? "affirmative" : "negative";
  appendEvent(config.id, {
    type: "result",
    winner,
    winnerTeam: teamOfSide(config, winner),
    votes: { affirmative: affVotes, negative: negVotes },
  });

  setPhase(config.id, "reviewing", t.verdictConfirmed);
}

/* ---------- Post-match review ---------- */

function normalizeReview(raw: unknown): Review | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const pair = (v: unknown): { evidenceId: string; comment: string }[] =>
    Array.isArray(v)
      ? (v as { evidenceId?: string; comment?: string }[]).map((e) => ({
          evidenceId: String(e.evidenceId ?? ""),
          comment: String(e.comment ?? ""),
        }))
      : [];
  const improvements = (r.improvements ?? {}) as Record<string, unknown>;
  return {
    decisiveIssues: asStringArray(r.decisiveIssues),
    turningPoints: asStringArray(r.turningPoints),
    strongEvidence: pair(r.strongEvidence),
    weakEvidence: pair(r.weakEvidence),
    effectiveRebuttals: asStringArray(r.effectiveRebuttals),
    suspectedOutOfHandout: asStringArray(r.suspectedOutOfHandout),
    judgeDifferences: String(r.judgeDifferences ?? ""),
    preparationComparison: String(r.preparationComparison ?? ""),
    teamOperationComparison: String(r.teamOperationComparison ?? ""),
    improvements: {
      A: asStringArray(improvements.A),
      B: asStringArray(improvements.B),
    },
  };
}

async function runReview(config: MatchConfig, ctl: RunControl): Promise<void> {
  const t = serverStrings(config.lang);
  const format = getFormat(config.formatId);
  const events = readEvents(config.id);
  const deliberations = events
    .filter((e) => e.type === "deliberation")
    .map((e) => `【${t.defaultTeamName(e.team)} / ${e.partId} / ${e.memberName}（${e.label}）】\n${e.text}`)
    .join("\n\n");
  const verdicts = getVerdicts(config.id);
  const affTeamName = config.teams[config.affirmative].name;
  const negTeamName = config.teams[config.affirmative === "A" ? "B" : "A"].name;

  const prompt = reviewPrompt({
    topic: config.topic,
    format,
    publicLog: publicLogOf(config.id),
    deliberations,
    verdictsJson: JSON.stringify(verdicts, null, 2),
    affirmativeTeamName: affTeamName,
    negativeTeamName: negTeamName,
    teamAKey: sideOfTeam(config, "A"),
    lang: config.lang,
  });

  const workspace = matchPaths.judgeWorkspace(config.id, "reviewer");
  ensureDir(workspace);

  updateThinking(config.id, "reviewer", {
    scope: "reviewer",
    agentIds: [config.reviewer.id],
    label: t.thinkReviewer,
  });
  let review: Review | undefined;
  for (let attempt = 0; attempt < 2 && !review; attempt++) {
    ctl.checkAborted();
    const res = await invokeAgent({
      kind: "review",
      agent: config.reviewer,
      matchId: config.id,
      label: "reviewer",
      instructions: attempt === 0 ? prompt : `${prompt}${t.jsonRetrySuffix}`,
      workspaceDir: workspace,
      allowWeb: false,
      needsFileTools: false,
      timeoutMs: JUDGE_TIMEOUT_MS,
      mockHints: { topic: config.topic, lang: config.lang },
    });
    review = normalizeReview(extractJsonObject(res.output));
  }
  if (!review) throw new Error(t.reviewParseError);

  saveReview(config.id, review);
  appendEvent(config.id, { type: "review-ready" });
  if (config.exhibition) {
    // In exhibition mode, finished = "all playback material is ready". Wait for every audio job.
    setProgress(config.id, t.waitingAudio);
    await Promise.allSettled(ttsJobs.get(config.id) ?? []);
  }
  setPhase(config.id, "finished");
}

export { renderPublicLog };

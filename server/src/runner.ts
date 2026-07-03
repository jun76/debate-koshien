import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  getFormat,
  sideOfTeam,
  teamOfSide,
  SIDE_LABEL,
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
import { sealDirectory, verifySeal } from "./hash.js";
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

export function isRunning(matchId: string): boolean {
  return running.has(matchId);
}

export function abortMatch(matchId: string): boolean {
  const r = running.get(matchId);
  if (!r) return false;
  r.aborted = true;
  return true;
}

/** 現在のフェーズから試合を進める（非同期で走らせ、この関数はすぐ返る） */
export function startMatch(matchId: string): { ok: boolean; message?: string } {
  if (running.has(matchId)) return { ok: false, message: "既に進行中" };
  const config = getConfig(matchId);
  if (!config) return { ok: false, message: "試合が存在しない" };
  let phase = getState(matchId).phase;
  if (phase === "finished" || phase === "aborted") return { ok: false, message: `フェーズ ${phase} からは進行できない` };
  if (phase === "error") {
    phase = getSeal(matchId, "A") && getSeal(matchId, "B") ? "sealed" : "setup";
    setPhase(matchId, phase, "エラー状態から再試行します");
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
    .finally(() => running.delete(matchId));

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

/* ---------- 準備フェーズ ---------- */

async function runPrep(config: MatchConfig, ctl: RunControl): Promise<void> {
  const format = getFormat(config.formatId);
  setPhase(config.id, "preparing");

  const teams: TeamKey[] = ["A", "B"];
  await Promise.all(
    teams.map(async (team) => {
      const side = sideOfTeam(config, team);
      const emitStatus = (status: string) => {
        appendEvent(config.id, { type: "prep", team, status });
      };
      emitStatus(`準備開始（${SIDE_LABEL[side]}）`);
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

      // 成果物を封印用ディレクトリへ複製し、封印する
      const workspace = matchPaths.prepWorkspace(config.id, team);
      const handoutDir = matchPaths.handoutDir(config.id, team);
      ensureDir(handoutDir);
      for (const f of ["handout.md", "evidence.json"]) {
        fs.copyFileSync(path.join(workspace, f), path.join(handoutDir, f));
      }
      const seal = sealDirectory(handoutDir, team);
      saveSeal(config.id, seal);
      appendEvent(config.id, { type: "seal", team, rootHash: seal.rootHash, fileCount: seal.files.length });
      emitStatus("ハンドアウト封印済み");
    }),
  );

  setPhase(config.id, "sealed", "両チームのハンドアウトを封印。以降 Web 利用は禁止");
}

/* ---------- ディベート本編 ---------- */

interface TeamMaterial {
  handoutMd: string;
  evidence: EvidenceEntry[];
  snapshotDir: string;
}

function loadSealedMaterial(config: MatchConfig, team: TeamKey): TeamMaterial {
  const handoutDir = matchPaths.handoutDir(config.id, team);
  const snapshotDir = matchPaths.sealedSnapshotDir(config.id, team);
  // エージェントには封印済みスナップショットのコピーを渡し、原本には触れさせない
  ensureDir(snapshotDir);
  for (const f of ["handout.md", "evidence.json"]) {
    fs.copyFileSync(path.join(handoutDir, f), path.join(snapshotDir, f));
  }
  const handoutMd = fs.readFileSync(path.join(snapshotDir, "handout.md"), "utf8");
  const side = sideOfTeam(config, team);
  const { evidence } = parseEvidence(fs.readFileSync(path.join(snapshotDir, "evidence.json"), "utf8"), side);
  return { handoutMd, evidence, snapshotDir };
}

function verifyTeamSeal(config: MatchConfig, team: TeamKey, when: "debate-start" | "judging-start"): void {
  const seal = getSeal(config.id, team);
  if (!seal) {
    appendEvent(config.id, { type: "hash-check", team, when, ok: false, detail: "封印記録が存在しない" });
    return;
  }
  const result = verifySeal(matchPaths.handoutDir(config.id, team), seal);
  appendEvent(config.id, { type: "hash-check", team, when, ok: result.ok, detail: result.detail });
  if (!result.ok) {
    appendEvent(config.id, {
      type: "warning",
      team,
      kind: "hash-mismatch",
      detail: `チーム${team} のハンドアウトが封印後に変更されている: ${result.detail}`,
    });
  }
}

function publicLogOf(matchId: string): SpeechEvent[] {
  return readEvents(matchId).filter((e): e is SpeechEvent => e.type === "speech");
}

async function runDebate(config: MatchConfig, ctl: RunControl): Promise<void> {
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
          setProgress(config.id, `${part.label}: 質問 ${ex + 1}/${max}`);
          questionText = (await emitUtterance(config, ctl, materials, {
            part,
            team: questionerTeam,
            kind: "question",
            exchangeIndex: ex,
          })).text;
        }
        setProgress(config.id, `${part.label}: 応答 ${ex + 1}/${max}`);
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
      setProgress(config.id, `${part.label} を生成中`);
      await emitUtterance(config, ctl, materials, {
        part,
        team: teamOfSide(config, part.side),
        kind: part.kind,
      });
    }
  }

  setPhase(config.id, "judging", "全パート終了。審査に入る");
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
    partLabel: opts.part.label,
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

/** 発言確定後にバックグラウンドで音声合成し、完了したら audio イベントを流す */
function scheduleTts(config: MatchConfig, ev: SpeechEvent): void {
  if (!config.tts || !ttsAvailable()) return;
  const audioDir = matchPaths.audioDir(config.id);
  const wavPath = path.join(audioDir, `${ev.id}.wav`);
  void enqueueSynthesis(speakableText(ev.text), wavPath)
    .then((durationMs) => {
      if (durationMs === null) return;
      appendEvent(config.id, { type: "audio", refId: ev.id, file: `${ev.id}.wav`, durationMs });
    })
    .catch((err) => {
      console.error(`[tts ${config.id}]`, err);
    });
}

/* ---------- 審査 ---------- */

function extractJsonObject(text: string): unknown | undefined {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // コードフェンスや前置きが混ざった場合に備え、最初の { から最後の } を試す
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

function collectWarningStrings(matchId: string): string[] {
  const out: string[] = [];
  for (const ev of readEvents(matchId)) {
    if (ev.type === "speech") {
      for (const w of ev.warnings) out.push(`${ev.partLabel}（${SIDE_LABEL[ev.side]}）: ${w.detail}`);
    } else if (ev.type === "warning") {
      out.push(ev.detail);
    }
  }
  return out;
}

function collectHashCheckStrings(matchId: string): string[] {
  return readEvents(matchId)
    .filter((e) => e.type === "hash-check")
    .map((e) => `チーム${e.team}（${e.when}）: ${e.ok ? "一致" : `不一致 ${e.detail ?? ""}`}`);
}

async function runJudging(config: MatchConfig, ctl: RunControl): Promise<void> {
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
    hashChecks: collectHashCheckStrings(config.id),
    warnings: collectWarningStrings(config.id),
  });

  const existing = new Set(getVerdicts(config.id).map((v) => v.judgeId));
  for (const judge of config.judges) {
    if (existing.has(judge.id)) continue;
    ctl.checkAborted();
    setProgress(config.id, `審査員 ${judge.name} が判定中`);
    updateThinking(config.id, "judge", {
      scope: "judge",
      agentIds: [judge.id],
      label: "判定を検討中",
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
        instructions: attempt === 0 ? prompt : `${prompt}\n\n（前回の出力は JSON として解釈できませんでした。指定した JSON だけを出力してください。）`,
        workspaceDir: workspace,
        allowWeb: false,
        needsFileTools: false,
        timeoutMs: JUDGE_TIMEOUT_MS,
        mockHints: {
          topic: config.topic,
          seed: judge.id,
          evidenceIds: aff.evidence.map((e) => e.id),
          opponentEvidenceIds: neg.evidence.map((e) => e.id),
        },
      });
      verdict = normalizeVerdict(extractJsonObject(res.output), judge.id, judge.name);
    }
    updateThinking(config.id, "judge", null);
    if (!verdict) throw new Error(`審査員 ${judge.name} の判定を JSON として解釈できない`);

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

  setPhase(config.id, "reviewing", "判定確定。感想戦レビューを生成中");
}

/* ---------- 試合後レビュー ---------- */

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
  const format = getFormat(config.formatId);
  const events = readEvents(config.id);
  const deliberations = events
    .filter((e) => e.type === "deliberation")
    .map((e) => `【チーム${e.team} / ${e.partId} / ${e.memberName}（${e.label}）】\n${e.text}`)
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
  });

  const workspace = matchPaths.judgeWorkspace(config.id, "reviewer");
  ensureDir(workspace);

  updateThinking(config.id, "reviewer", {
    scope: "reviewer",
    agentIds: [config.reviewer.id],
    label: "感想戦レビューを執筆中",
  });
  let review: Review | undefined;
  for (let attempt = 0; attempt < 2 && !review; attempt++) {
    ctl.checkAborted();
    const res = await invokeAgent({
      kind: "review",
      agent: config.reviewer,
      matchId: config.id,
      label: "reviewer",
      instructions: attempt === 0 ? prompt : `${prompt}\n\n（前回の出力は JSON として解釈できませんでした。指定した JSON だけを出力してください。）`,
      workspaceDir: workspace,
      allowWeb: false,
      needsFileTools: false,
      timeoutMs: JUDGE_TIMEOUT_MS,
      mockHints: { topic: config.topic },
    });
    review = normalizeReview(extractJsonObject(res.output));
  }
  if (!review) throw new Error("レビューを JSON として解釈できない");

  saveReview(config.id, review);
  appendEvent(config.id, { type: "review-ready" });
  setPhase(config.id, "finished");
}

export { renderPublicLog };

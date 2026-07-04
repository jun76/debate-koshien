import { sideLabel, type Lang, type Provider, type Side } from "@debate-koshien/shared";
import type { SealDiff } from "./hash.js";

/**
 * Server-emitted, user-facing strings (progress/status/warning/validation text and
 * server-generated default names). These are rendered in the match's language at emit time and
 * stored in the event log, so a match stays self-consistent regardless of the UI language later.
 */

type HashWhen = "debate-start" | "judging-start";

export interface ServerStrings {
  /* runner: phases & progress */
  retryFromError: string;
  alreadyRunning: string;
  matchNotExist: string;
  cannotAdvance: (phase: string) => string;
  prepStart: (side: Side) => string;
  handoutSealed: string;
  bothSealed: string;
  allPartsDone: string;
  verdictConfirmed: string;
  waitingAudio: string;
  jsonRetrySuffix: string;
  progressQuestion: (partLabel: string, i: number, max: number) => string;
  progressAnswer: (partLabel: string, i: number, max: number) => string;
  progressGenerating: (partLabel: string) => string;
  judgeDeciding: (name: string) => string;
  judgeParseError: (name: string) => string;
  reviewParseError: string;

  /* runner: seal verification */
  sealMissing: string;
  hashOk: string;
  hashMismatch: (detail: string) => string;
  sealDiff: (diff: SealDiff) => string;
  rootMismatch: string;
  handoutTampered: (team: string, detail: string) => string;
  hashWhen: (when: HashWhen) => string;
  warningLine: (partLabel: string, side: Side, detail: string) => string;
  hashCheckLine: (team: string, when: HashWhen, ok: boolean, detail: string) => string;

  /* thinking labels */
  thinkResearching: string;
  thinkCompiling: string;
  thinkFixing: string;
  thinkPart: (partLabel: string) => string;
  thinkDrafting: string;
  thinkMerging: string;
  thinkQuestion: string;
  thinkAnswer: string;
  thinkFinalCheck: string;
  thinkRegenerate: string;
  thinkJudge: string;
  thinkReviewer: string;

  /* strategies: prep status & errors */
  researching: (names: string) => string;
  compiling: (name: string) => string;
  fixingArtifacts: (count: number) => string;
  handoutInvalid: (team: string, errors: string) => string;
  handoutMissingEvidence: string;
  handoutMissingFile: string;
  handoutTooThin: string;
  labelDraft: string;
  labelAssigneeDraft: string;

  /* checks: evidence schema & speech warnings */
  evidenceNotArray: string;
  evidenceEmpty: string;
  evidenceNotObject: (i: number) => string;
  evidenceBadId: (i: number, prefix: string, actual: string) => string;
  evidenceDupId: (i: number, id: string) => string;
  evidenceNoClaim: (i: number) => string;
  evidenceNoQuote: (i: number) => string;
  evidenceNoSourceTitle: (i: number) => string;
  evidenceBadJson: (msg: string) => string;
  warnUnknownEvidence: (id: string) => string;
  warnOverLength: (max: number, actual: number) => string;
  warnNoCitation: string;
  warnWebTool: (name: string) => string;

  /* index: create-match validation & defaults */
  errTopicRequired: string;
  errBadFormat: string;
  errTeamMemberCount: (team: string) => string;
  errBadProvider: (team: string, provider: string) => string;
  errOddJudges: string;
  deleteNotFound: string;
  deleteFailed: (msg: string) => string;
  defaultTeamName: (team: string) => string;
  defaultJudgeName: (i: number, provider: Provider) => string;
  defaultReviewerName: (provider: Provider) => string;
}

const HASH_WHEN_JA: Record<HashWhen, string> = { "debate-start": "試合開始時", "judging-start": "審査開始時" };
const HASH_WHEN_EN: Record<HashWhen, string> = { "debate-start": "at debate start", "judging-start": "at judging start" };

const SEAL_DIFF_JA: Record<SealDiff["kind"], string> = { added: "追加", changed: "変更", removed: "削除" };
const SEAL_DIFF_EN: Record<SealDiff["kind"], string> = { added: "added", changed: "changed", removed: "removed" };

const JA: ServerStrings = {
  retryFromError: "エラー状態から再試行します",
  alreadyRunning: "既に進行中",
  matchNotExist: "試合が存在しない",
  cannotAdvance: (phase) => `フェーズ ${phase} からは進行できない`,
  prepStart: (side) => `準備開始（${sideLabel(side, "ja")}）`,
  handoutSealed: "ハンドアウト封印済み",
  bothSealed: "両チームのハンドアウトを封印。以降 Web 利用は禁止",
  allPartsDone: "全パート終了。審査に入る",
  verdictConfirmed: "判定確定。感想戦レビューを生成中",
  waitingAudio: "音声合成の完了を待機中",
  jsonRetrySuffix: "\n\n（前回の出力は JSON として解釈できませんでした。指定した JSON だけを出力してください。）",
  progressQuestion: (label, i, max) => `${label}: 質問 ${i}/${max}`,
  progressAnswer: (label, i, max) => `${label}: 応答 ${i}/${max}`,
  progressGenerating: (label) => `${label} を生成中`,
  judgeDeciding: (name) => `審査員 ${name} が判定中`,
  judgeParseError: (name) => `審査員 ${name} の判定を JSON として解釈できない`,
  reviewParseError: "レビューを JSON として解釈できない",

  sealMissing: "封印記録が存在しない",
  hashOk: "一致",
  hashMismatch: (detail) => `不一致 ${detail}`,
  sealDiff: (diff) => `${SEAL_DIFF_JA[diff.kind]}: ${diff.path}`,
  rootMismatch: "ルートハッシュ不一致",
  handoutTampered: (team, detail) => `チーム${team} のハンドアウトが封印後に変更されている: ${detail}`,
  hashWhen: (when) => HASH_WHEN_JA[when],
  warningLine: (label, side, detail) => `${label}（${sideLabel(side, "ja")}）: ${detail}`,
  hashCheckLine: (team, when, ok, detail) =>
    `チーム${team}（${HASH_WHEN_JA[when]}）: ${ok ? "一致" : `不一致 ${detail}`}`,

  thinkResearching: "調査中",
  thinkCompiling: "ハンドアウト作成中",
  thinkFixing: "成果物を修正中",
  thinkPart: (label) => `${label}を思考中`,
  thinkDrafting: "草案を作成中",
  thinkMerging: "チーム発言を統合中",
  thinkQuestion: "質問を思考中",
  thinkAnswer: "応答を思考中",
  thinkFinalCheck: "最終確認中",
  thinkRegenerate: "文字数上限内に再生成中",
  thinkJudge: "判定を検討中",
  thinkReviewer: "感想戦レビューを執筆中",

  researching: (names) => `調査中（${names}）`,
  compiling: (name) => `ハンドアウト作成中（${name}）`,
  fixingArtifacts: (count) => `成果物の不備を修正中（${count}件）`,
  handoutInvalid: (team, errors) => `チーム${team} のハンドアウトが規定を満たさない: ${errors}`,
  handoutMissingEvidence: "evidence.json が存在しない",
  handoutMissingFile: "handout.md が存在しない",
  handoutTooThin: "handout.md の内容が薄すぎる（論点構成と証拠の位置づけを記述すること）",
  labelDraft: "草案",
  labelAssigneeDraft: "担当者案",

  evidenceNotArray: "evidence.json はエントリの配列である必要がある",
  evidenceEmpty: "証拠エントリが1件もない",
  evidenceNotObject: (i) => `[${i}] オブジェクトではない`,
  evidenceBadId: (i, prefix, actual) => `[${i}] id は「${prefix}-01」形式の文字列である必要がある（実際: ${actual}）`,
  evidenceDupId: (i, id) => `[${i}] id ${id} が重複している`,
  evidenceNoClaim: (i) => `[${i}] claim（この証拠が支える主張）が必要`,
  evidenceNoQuote: (i) => `[${i}] quote（出典からの引用・要約）が必要`,
  evidenceNoSourceTitle: (i) => `[${i}] source.title（出典タイトル）が必要`,
  evidenceBadJson: (msg) => `evidence.json が JSON として不正: ${msg}`,
  warnUnknownEvidence: (id) => `封印済み資料に存在しない証拠 ID [${id}] を参照した`,
  warnOverLength: (max, actual) => `文字数上限 ${max} を超過（${actual}字）したため切り詰めた`,
  warnNoCitation: "証拠参照のない発言（事実主張の根拠が確認できない）",
  warnWebTool: (name) => `ディベート本編中に Web 系ツール（${name}）の使用が記録された`,

  errTopicRequired: "論題を入力してください",
  errBadFormat: "フォーマットが不正です",
  errTeamMemberCount: (team) => `チーム${team} のメンバーは1〜5人にしてください`,
  errBadProvider: (team, provider) => `チーム${team} に不正なプロバイダ: ${provider}`,
  errOddJudges: "審査員は奇数人（1・3・5人）にしてください",
  deleteNotFound: "試合が見つかりません",
  deleteFailed: (msg) => `削除に失敗しました: ${msg}`,
  defaultTeamName: (team) => `チーム${team}`,
  defaultJudgeName: (i, provider) => `審査員${i}（${provider}）`,
  defaultReviewerName: (provider) => `解説（${provider}）`,
};

const EN: ServerStrings = {
  retryFromError: "Retrying from the error state",
  alreadyRunning: "Already running",
  matchNotExist: "The match does not exist",
  cannotAdvance: (phase) => `Cannot advance from phase ${phase}`,
  prepStart: (side) => `Preparation started (${sideLabel(side, "en")})`,
  handoutSealed: "Handout sealed",
  bothSealed: "Both teams' handouts sealed. Web access is now forbidden",
  allPartsDone: "All parts finished. Moving to judging",
  verdictConfirmed: "Verdict confirmed. Generating the post-match review",
  waitingAudio: "Waiting for audio synthesis to finish",
  jsonRetrySuffix: "\n\n(The previous output could not be parsed as JSON. Output only the specified JSON.)",
  progressQuestion: (label, i, max) => `${label}: Question ${i}/${max}`,
  progressAnswer: (label, i, max) => `${label}: Answer ${i}/${max}`,
  progressGenerating: (label) => `Generating ${label}`,
  judgeDeciding: (name) => `Judge ${name} is deciding`,
  judgeParseError: (name) => `Judge ${name}'s verdict could not be parsed as JSON`,
  reviewParseError: "The review could not be parsed as JSON",

  sealMissing: "No seal record exists",
  hashOk: "match",
  hashMismatch: (detail) => `mismatch ${detail}`,
  sealDiff: (diff) => `${SEAL_DIFF_EN[diff.kind]}: ${diff.path}`,
  rootMismatch: "root hash mismatch",
  handoutTampered: (team, detail) => `Team ${team}'s handout was modified after sealing: ${detail}`,
  hashWhen: (when) => HASH_WHEN_EN[when],
  warningLine: (label, side, detail) => `${label} (${sideLabel(side, "en")}): ${detail}`,
  hashCheckLine: (team, when, ok, detail) =>
    `Team ${team} (${HASH_WHEN_EN[when]}): ${ok ? "match" : `mismatch ${detail}`}`,

  thinkResearching: "Researching",
  thinkCompiling: "Building the handout",
  thinkFixing: "Fixing the artifacts",
  thinkPart: (label) => `Thinking about the ${label}`,
  thinkDrafting: "Drafting",
  thinkMerging: "Merging the team's speech",
  thinkQuestion: "Thinking about the question",
  thinkAnswer: "Thinking about the answer",
  thinkFinalCheck: "Final check",
  thinkRegenerate: "Regenerating within the character limit",
  thinkJudge: "Considering the verdict",
  thinkReviewer: "Writing the post-match review",

  researching: (names) => `Researching (${names})`,
  compiling: (name) => `Building the handout (${name})`,
  fixingArtifacts: (count) => `Fixing artifact issues (${count})`,
  handoutInvalid: (team, errors) => `Team ${team}'s handout does not meet the requirements: ${errors}`,
  handoutMissingEvidence: "evidence.json does not exist",
  handoutMissingFile: "handout.md does not exist",
  handoutTooThin: "handout.md is too thin (describe the argument structure and the role of each piece of evidence)",
  labelDraft: "Draft",
  labelAssigneeDraft: "Member's draft",

  evidenceNotArray: "evidence.json must be an array of entries",
  evidenceEmpty: "No evidence entries at all",
  evidenceNotObject: (i) => `[${i}] not an object`,
  evidenceBadId: (i, prefix, actual) => `[${i}] id must be a string like "${prefix}-01" (actual: ${actual})`,
  evidenceDupId: (i, id) => `[${i}] id ${id} is duplicated`,
  evidenceNoClaim: (i) => `[${i}] claim (the claim this evidence supports) is required`,
  evidenceNoQuote: (i) => `[${i}] quote (quote or paraphrase from the source) is required`,
  evidenceNoSourceTitle: (i) => `[${i}] source.title (source title) is required`,
  evidenceBadJson: (msg) => `evidence.json is not valid JSON: ${msg}`,
  warnUnknownEvidence: (id) => `Cited an evidence ID [${id}] that is not in the sealed material`,
  warnOverLength: (max, actual) => `Exceeded the ${max}-character limit (${actual} chars) and was truncated`,
  warnNoCitation: "A speech with no evidence citation (grounds for the factual claims cannot be verified)",
  warnWebTool: (name) => `Use of a web tool (${name}) was recorded during the debate proper`,

  errTopicRequired: "Please enter a resolution",
  errBadFormat: "Invalid format",
  errTeamMemberCount: (team) => `Team ${team} must have 1-5 members`,
  errBadProvider: (team, provider) => `Team ${team} has an invalid provider: ${provider}`,
  errOddJudges: "The number of judges must be odd (1, 3, or 5)",
  deleteNotFound: "Match not found",
  deleteFailed: (msg) => `Failed to delete: ${msg}`,
  defaultTeamName: (team) => `Team ${team}`,
  defaultJudgeName: (i, provider) => `Judge ${i} (${provider})`,
  defaultReviewerName: (provider) => `Commentator (${provider})`,
};

export function serverStrings(lang: Lang): ServerStrings {
  return lang === "en" ? EN : JA;
}

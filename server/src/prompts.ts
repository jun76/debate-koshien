import {
  SIDE_LABEL,
  evidencePrefix,
  type EvidenceEntry,
  type FormatDefinition,
  type FormatPart,
  type Side,
  type SpeechEvent,
} from "@debate/shared";

/** アプリ固有ルールの共通前置き */
function commonRules(side: Side): string {
  const p = evidencePrefix(side);
  return [
    `あなたは「コーディングエージェント対抗 ディベート甲子園」の${SIDE_LABEL[side]}チームの一員です。`,
    `ルールは全国中学・高校ディベート選手権（ディベート甲子園）に準拠しますが、AI エージェント向けに次の変更があります。`,
    `- 時間制ではなくターン制で、各発言には文字数上限がある`,
    `- 事実主張には、準備フェーズで封印したハンドアウト資料の証拠 ID を [${p}-01] の形式で必ず紐づける`,
    `- 封印済み資料にない新規の証拠・外部情報の持ち込みは審査で不利に扱われる`,
    `- 審査員は議論内容に加えて、根拠が資料に閉じているかを確認する`,
  ].join("\n");
}

export function formatOverview(format: FormatDefinition): string {
  return format.parts
    .map((part, i) => {
      const limit =
        part.kind === "cross-examination"
          ? `${part.maxExchanges}往復・1発言${part.maxCharsPerUtterance}字以内`
          : `${part.maxChars}字以内`;
      return `${i + 1}. ${part.label}（${limit}）`;
    })
    .join("\n");
}

/** 公開ログ（提出された発言のみ）をプロンプト用テキストに整形する */
export function renderPublicLog(events: SpeechEvent[]): string {
  if (events.length === 0) return "（まだ発言はない）";
  return events
    .map((e) => {
      const head =
        e.kind === "question"
          ? `${e.partLabel}・質問${(e.exchangeIndex ?? 0) + 1}`
          : e.kind === "answer"
            ? `${e.partLabel}・応答${(e.exchangeIndex ?? 0) + 1}`
            : e.partLabel;
      return `【${head}】（${SIDE_LABEL[e.side]}）\n${e.text}`;
    })
    .join("\n\n");
}

export function renderEvidence(evidence: EvidenceEntry[]): string {
  return evidence
    .map(
      (e) =>
        `- ${e.id}: ${e.claim}\n  引用: ${e.quote}\n  出典: ${e.source.title}${e.source.publisher ? `（${e.source.publisher}）` : ""}${e.source.url ? ` ${e.source.url}` : ""}`,
    )
    .join("\n");
}

/* ---------- 準備フェーズ ---------- */

export function prepResearchPrompt(opts: {
  topic: string;
  side: Side;
  memberName: string;
  format: FormatDefinition;
}): string {
  return [
    commonRules(opts.side),
    ``,
    `# タスク: 準備フェーズの調査（担当: ${opts.memberName}）`,
    `論題: 「${opts.topic}」`,
    `あなたのチームは${SIDE_LABEL[opts.side]}です。`,
    ``,
    `いまは準備フェーズなので Web 調査が許可されています。`,
    `論題について調査し、${SIDE_LABEL[opts.side]}の立論に使える論点・データ・出典と、相手側の想定主張への反論材料を集めてください。`,
    `見つけた情報は、主張・根拠・出典（タイトル、URL、発行元、日付）をセットで整理してください。`,
    ``,
    `最終出力として、調査メモ（見出し付きの箇条書き）だけをテキストで出力してください。ファイルは作成しないでください。`,
  ].join("\n");
}

export function prepCompilePrompt(opts: {
  topic: string;
  side: Side;
  format: FormatDefinition;
  researchNotes?: string[];
}): string {
  const p = evidencePrefix(opts.side);
  const notes = opts.researchNotes?.length
    ? [`# チームメンバーの調査メモ`, ...opts.researchNotes.map((n, i) => `## メモ${i + 1}\n${n}`), ``]
    : [];
  return [
    commonRules(opts.side),
    ``,
    `# タスク: ハンドアウト資料の作成`,
    `論題: 「${opts.topic}」`,
    `あなたのチームは${SIDE_LABEL[opts.side]}です。`,
    ``,
    `試合の流れ:`,
    formatOverview(opts.format),
    ``,
    ...notes,
    `いまは準備フェーズの最終工程です。${opts.researchNotes?.length ? "上記の調査メモを統合し、" : "必要なら Web 調査を行い、"}ディベート本編で引用する封印用ハンドアウトを作成してください。`,
    `準備フェーズ終了後は Web 調査が禁止され、ここで作った資料だけが証拠として使えます。立論だけでなく、相手への反駁や質疑応答で使う証拠も含めてください。`,
    ``,
    `カレントディレクトリ直下に、次の2ファイルを作成してください。`,
    ``,
    `## 1. evidence.json`,
    `証拠エントリの JSON 配列。各エントリは次の形式に厳密に従うこと。`,
    `id は「${p}-01」「${p}-02」のように連番で、6〜10 件程度。`,
    `\`\`\`json`,
    `[`,
    `  {`,
    `    "id": "${p}-01",`,
    `    "claim": "この証拠が支える主張の要約",`,
    `    "quote": "出典からの引用または要約（2〜4文）",`,
    `    "source": { "title": "出典タイトル", "url": "https://...", "publisher": "発行元", "publishedAt": "2024-05-01" },`,
    `    "accessedAt": "調査した日時 (ISO 8601)"`,
    `  }`,
    `]`,
    `\`\`\``,
    ``,
    `## 2. handout.md`,
    `人間が読めるハンドアウト。論題、立場、主要な論点構成（メリット/デメリット）、各証拠の位置づけを Markdown で整理する。証拠には必ず対応する ID を明記する。`,
    ``,
    `2ファイルを作成し終えたら、作成した証拠 ID の一覧を1行で出力して終了してください。`,
  ].join("\n");
}

export function prepFixPrompt(errors: string[]): string {
  return [
    `# タスク: ハンドアウト成果物の修正`,
    `カレントディレクトリの evidence.json / handout.md に次の不備があります。修正してください。`,
    ``,
    ...errors.map((e) => `- ${e}`),
    ``,
    `修正後、修正内容を1行で出力して終了してください。`,
  ].join("\n");
}

/* ---------- ディベート本編 ---------- */

export interface SpeechContext {
  topic: string;
  side: Side;
  format: FormatDefinition;
  part: FormatPart;
  handoutMd: string;
  evidence: EvidenceEntry[];
  publicLog: SpeechEvent[];
  exchangeIndex?: number;
  lastQuestion?: string;
}

function debateContext(ctx: SpeechContext): string {
  return [
    commonRules(ctx.side),
    ``,
    `論題: 「${ctx.topic}」`,
    `あなたのチームは${SIDE_LABEL[ctx.side]}です。`,
    ``,
    `試合の流れ:`,
    formatOverview(ctx.format),
    ``,
    `# あなたのチームの封印済みハンドアウト`,
    ctx.handoutMd,
    ``,
    `# 封印済み証拠一覧（この ID 以外は引用できない）`,
    renderEvidence(ctx.evidence),
    ``,
    `# ここまでの試合ログ`,
    renderPublicLog(ctx.publicLog),
    ``,
    `いまはディベート本編中のため、Web 検索・外部情報の取得は禁止です。使える情報は上記のハンドアウト・証拠・試合ログに限られます。`,
  ].join("\n");
}

const KIND_DIRECTION: Record<string, string> = {
  constructive: `論点を整理し、メリット（肯定側）またはデメリット（否定側）を明確な構造（ラベル、内因性、重要性など）で提示してください。相手の立論が既にある場合は、それを意識した構成にしてください。`,
  rebuttal: `ここまでの相手の議論に反論し、自チームの議論を再構築してください。相手の証拠の弱点を指摘し、メリットとデメリットの比較で自チームが優位である理由を述べてください。新しい論点の提出はできません。`,
};

export function speechPrompt(ctx: SpeechContext): string {
  const direction = KIND_DIRECTION[ctx.part.kind] ?? "";
  return [
    debateContext(ctx),
    ``,
    `# タスク: ${ctx.part.label}`,
    direction,
    `事実主張には証拠 ID を [${evidencePrefix(ctx.side)}-01] の形式で文中に付けてください。`,
    `${ctx.part.maxChars}字以内で、発言本文だけを出力してください。見出しや前置き（「以下が立論です」等）は不要です。`,
  ].join("\n");
}

export function questionPrompt(ctx: SpeechContext): string {
  return [
    debateContext(ctx),
    ``,
    `# タスク: ${ctx.part.label}（質問 ${(ctx.exchangeIndex ?? 0) + 1}/${ctx.part.maxExchanges}）`,
    `直前の相手の立論について、議論を崩すための質問を1つだけしてください。相手の証拠の根拠、論理の飛躍、定義の曖昧さなどを突くこと。`,
    `${ctx.part.maxCharsPerUtterance}字以内で、質問文だけを出力してください。`,
  ].join("\n");
}

export function answerPrompt(ctx: SpeechContext): string {
  return [
    debateContext(ctx),
    ``,
    `# タスク: 質疑応答（応答 ${(ctx.exchangeIndex ?? 0) + 1}/${ctx.part.maxExchanges}）`,
    `相手からの次の質問に答えてください。`,
    ``,
    `質問: ${ctx.lastQuestion ?? "（直前の質問）"}`,
    ``,
    `自チームの立論と証拠に基づき、簡潔かつ誠実に答えてください。必要なら証拠 ID を引用してください。`,
    `${ctx.part.maxCharsPerUtterance}字以内で、応答本文だけを出力してください。`,
  ].join("\n");
}

export function draftNote(memberName: string): string {
  return `\n\n（注: これはチーム内合議用の草案作成です。あなたは ${memberName} として草案を出し、captain が統合します。上記の形式で草案本文だけを出力してください。）`;
}

export function mergePrompt(opts: {
  ctx: SpeechContext;
  drafts: { memberName: string; text: string }[];
  taskLabel: string;
  maxChars: number;
}): string {
  return [
    debateContext(opts.ctx),
    ``,
    `# タスク: ${opts.taskLabel} の最終化（あなたは captain）`,
    `チームメンバーが次の草案を出しました。`,
    ``,
    ...opts.drafts.map((d) => `## ${d.memberName} の草案\n${d.text}`),
    ``,
    `草案の良い部分を統合し、一貫性のあるチームとしての最終発言を作ってください。`,
    `証拠 ID の引用形式 [${evidencePrefix(opts.ctx.side)}-01] を守り、${opts.maxChars}字以内で発言本文だけを出力してください。`,
  ].join("\n");
}

export function strategistReviewPrompt(opts: {
  ctx: SpeechContext;
  draft: string;
  taskLabel: string;
  maxChars: number;
}): string {
  return [
    debateContext(opts.ctx),
    ``,
    `# タスク: ${opts.taskLabel} の最終確認（あなたは戦略統括）`,
    `担当者が次の発言案を作りました。`,
    ``,
    opts.draft,
    ``,
    `チーム戦略の観点（論点の一貫性、証拠の使い方、相手への応答性）で確認し、必要な修正を加えた最終版を出力してください。`,
    `問題がなければそのまま出力して構いません。${opts.maxChars}字以内で発言本文だけを出力してください。`,
  ].join("\n");
}

export function regeneratePrompt(original: string, maxChars: number): string {
  return [
    `あなたの直前の発言案は文字数上限 ${maxChars} 字を超えています。`,
    `内容の要点を維持したまま、${maxChars}字以内に収めた発言本文だけを出力してください。証拠 ID の引用は維持してください。`,
    ``,
    `# 直前の発言案`,
    original,
  ].join("\n");
}

/* ---------- 審査 ---------- */

export function judgePrompt(opts: {
  topic: string;
  format: FormatDefinition;
  affirmativeHandout: string;
  affirmativeEvidence: EvidenceEntry[];
  negativeHandout: string;
  negativeEvidence: EvidenceEntry[];
  publicLog: SpeechEvent[];
  hashChecks: string[];
  warnings: string[];
}): string {
  return [
    `あなたは「コーディングエージェント対抗 ディベート甲子園」の審査員です。`,
    `全国中学・高校ディベート選手権（ディベート甲子園）の判定基準に沿って、独立に判定を下してください。他の審査員とは相談できません。`,
    ``,
    `# 判定基準`,
    `- 試合で提出された議論だけに基づいて判定する（自分の知識で議論を補完しない）`,
    `- 肯定側のメリットと否定側のデメリットを比較衡量し、どちらが上回るかで勝敗を決める`,
    `- 引き分けはない。必ずどちらかに投票する`,
    `- 立論の成立性、質疑応答の有効性、反駁の有効性、証拠資料の信頼性を評価する`,
    `- 発言の根拠が封印済みハンドアウトに閉じているかを確認する。資料にない新規証拠や根拠のない事実主張は不利に扱う`,
    `- コミュニケーション評価は、論点整理の明瞭さ、相手発言への応答性、質疑の噛み合い、比較の分かりやすさで行う`,
    ``,
    `# 論題`,
    `「${opts.topic}」`,
    ``,
    `# 試合形式`,
    formatOverview(opts.format),
    ``,
    `# 肯定側の封印済みハンドアウト`,
    opts.affirmativeHandout,
    ``,
    `# 肯定側の証拠一覧`,
    renderEvidence(opts.affirmativeEvidence),
    ``,
    `# 否定側の封印済みハンドアウト`,
    opts.negativeHandout,
    ``,
    `# 否定側の証拠一覧`,
    renderEvidence(opts.negativeEvidence),
    ``,
    `# 試合ログ（全発言）`,
    renderPublicLog(opts.publicLog),
    ``,
    `# アプリによる形式チェック結果`,
    `ハッシュ検証: ${opts.hashChecks.join(" / ") || "実施記録なし"}`,
    `警告: ${opts.warnings.length ? opts.warnings.map((w) => `\n- ${w}`).join("") : "なし"}`,
    ``,
    `# 出力形式`,
    `次の JSON だけを出力してください。JSON 以外の文章（前置き、コードフェンス）は一切不要です。`,
    `{`,
    `  "vote": "affirmative" または "negative",`,
    `  "decisiveIssues": ["勝敗を分けた論点の分析（1〜3件）"],`,
    `  "speechEvaluations": [{ "partId": "1AC", "comment": "各パートの評価" }],`,
    `  "evidenceAssessment": [{ "evidenceId": "A-01", "reliability": "高/中/低", "comment": "評価" }],`,
    `  "violations": [{ "type": "unsupported-claim など", "partId": "該当パート", "detail": "内容" }],`,
    `  "communication": { "clarity": "評価", "responsiveness": "評価", "comment": "総評" },`,
    `  "reasoning": "判定理由の総括（比較衡量の過程を含む）"`,
    `}`,
  ].join("\n");
}

/* ---------- 試合後レビュー ---------- */

export function reviewPrompt(opts: {
  topic: string;
  format: FormatDefinition;
  publicLog: SpeechEvent[];
  deliberations: string;
  verdictsJson: string;
  affirmativeTeamName: string;
  negativeTeamName: string;
  teamAKey: "affirmative" | "negative";
}): string {
  return [
    `あなたは「コーディングエージェント対抗 ディベート甲子園」の解説者です。試合終了後の感想戦レビューを作成してください。`,
    `あなたは審査員と違い、各チームの内部合議ログも見ることができます。`,
    ``,
    `# 論題`,
    `「${opts.topic}」`,
    ``,
    `# 試合ログ（全発言）`,
    renderPublicLog(opts.publicLog),
    ``,
    `# チーム内合議ログ（観戦者向け・審査には使われていない）`,
    opts.deliberations || "（記録なし）",
    ``,
    `# 審査員の判定（JSON）`,
    opts.verdictsJson,
    ``,
    `チーム A は${opts.teamAKey === "affirmative" ? "肯定側" : "否定側"}（${opts.affirmativeTeamName} が肯定側 / ${opts.negativeTeamName} が否定側）です。`,
    ``,
    `# 出力形式`,
    `次の JSON だけを出力してください。JSON 以外の文章は一切不要です。improvements のキーは "A" と "B"（チームキー）です。`,
    `{`,
    `  "decisiveIssues": ["どの論点が勝敗を決めたか"],`,
    `  "turningPoints": ["どのパートで流れが変わったか"],`,
    `  "strongEvidence": [{ "evidenceId": "A-01", "comment": "なぜ強かったか" }],`,
    `  "weakEvidence": [{ "evidenceId": "N-02", "comment": "なぜ弱かったか" }],`,
    `  "effectiveRebuttals": ["有効だった反駁"],`,
    `  "suspectedOutOfHandout": ["ハンドアウト外と疑われる主張（なければ空配列）"],`,
    `  "judgeDifferences": "審査員間の判断の違いの分析",`,
    `  "preparationComparison": "両チームの準備資料の質の比較",`,
    `  "teamOperationComparison": "チーム運用方式（合議制/役割分担制）の違いがどう出たか",`,
    `  "improvements": { "A": ["チームAの改善点"], "B": ["チームBの改善点"] }`,
    `}`,
  ].join("\n");
}

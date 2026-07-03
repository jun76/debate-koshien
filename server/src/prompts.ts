import {
  evidencePrefix,
  partLabel,
  sideLabel,
  type EvidenceEntry,
  type FormatDefinition,
  type FormatPart,
  type Lang,
  type Side,
  type SpeechEvent,
} from "@debate/shared";

/** Stable marker separating the regenerate instruction from the previous draft (both languages). */
export const PREVIOUS_DRAFT_MARKER = "<<<PREVIOUS_DRAFT>>>";

/**
 * Explicit output-language directive. The resolution or other context text may be in another
 * language, so every prompt states the required output language unambiguously.
 */
export function languageDirective(lang: Lang): string {
  return lang === "en"
    ? "IMPORTANT: Write your entire response in English, regardless of the language of the resolution, handout, or any other text below."
    : "重要: 論題・ハンドアウト・以下のいかなるテキストの言語にもかかわらず、回答はすべて日本語で書いてください。";
}

/** Short reminder appended to a task's final instruction, right before the model outputs. */
function langReminder(lang: Lang): string {
  return lang === "en" ? "Write in English." : "日本語で書いてください。";
}

/** Common preamble describing the app-specific rules. */
function commonRules(side: Side, lang: Lang): string {
  const p = evidencePrefix(side);
  const label = sideLabel(side, lang);
  if (lang === "en") {
    return [
      languageDirective(lang),
      `You are a member of the ${label} team in the "Coding-Agent Debate Koshien".`,
      `The rules follow Japan's National Middle/High School Debate Championship ("Debate Koshien"), with these changes for AI agents:`,
      `- Turn-based instead of timed; every speech has a character limit`,
      `- Every factual claim must be tied to an evidence ID from the handout sealed during preparation, in the form [${p}-01]`,
      `- Bringing in new evidence or outside information not in the sealed material is penalized in judging`,
      `- In addition to the argument itself, judges check whether the reasoning stays within the sealed material`,
    ].join("\n");
  }
  return [
    languageDirective(lang),
    `あなたは「コーディングエージェント対抗 ディベート甲子園」の${label}チームの一員です。`,
    `ルールは全国中学・高校ディベート選手権（ディベート甲子園）に準拠しますが、AI エージェント向けに次の変更があります。`,
    `- 時間制ではなくターン制で、各発言には文字数上限がある`,
    `- 事実主張には、準備フェーズで封印したハンドアウト資料の証拠 ID を [${p}-01] の形式で必ず紐づける`,
    `- 封印済み資料にない新規の証拠・外部情報の持ち込みは審査で不利に扱われる`,
    `- 審査員は議論内容に加えて、根拠が資料に閉じているかを確認する`,
  ].join("\n");
}

export function formatOverview(format: FormatDefinition, lang: Lang): string {
  return format.parts
    .map((part, i) => {
      const limit =
        part.kind === "cross-examination"
          ? lang === "en"
            ? `${part.maxExchanges} exchanges, up to ${part.maxCharsPerUtterance} chars each`
            : `${part.maxExchanges}往復・1発言${part.maxCharsPerUtterance}字以内`
          : lang === "en"
            ? `up to ${part.maxChars} chars`
            : `${part.maxChars}字以内`;
      return `${i + 1}. ${partLabel(part.id, lang)}（${limit}）`;
    })
    .join("\n");
}

/** Format the public log (submitted speeches only) into prompt text. */
export function renderPublicLog(events: SpeechEvent[], lang: Lang): string {
  if (events.length === 0) return lang === "en" ? "(no speeches yet)" : "（まだ発言はない）";
  return events
    .map((e) => {
      const label = partLabel(e.partId, lang);
      const n = (e.exchangeIndex ?? 0) + 1;
      const head =
        e.kind === "question"
          ? lang === "en"
            ? `${label} - Question ${n}`
            : `${label}・質問${n}`
          : e.kind === "answer"
            ? lang === "en"
              ? `${label} - Answer ${n}`
              : `${label}・応答${n}`
            : label;
      return `【${head}】（${sideLabel(e.side, lang)}）\n${e.text}`;
    })
    .join("\n\n");
}

export function renderEvidence(evidence: EvidenceEntry[], lang: Lang): string {
  const quoteLabel = lang === "en" ? "Quote" : "引用";
  const sourceLabel = lang === "en" ? "Source" : "出典";
  return evidence
    .map(
      (e) =>
        `- ${e.id}: ${e.claim}\n  ${quoteLabel}: ${e.quote}\n  ${sourceLabel}: ${e.source.title}${e.source.publisher ? `（${e.source.publisher}）` : ""}${e.source.url ? ` ${e.source.url}` : ""}`,
    )
    .join("\n");
}

/* ---------- Preparation phase ---------- */

export function prepResearchPrompt(opts: {
  topic: string;
  side: Side;
  memberName: string;
  format: FormatDefinition;
  lang: Lang;
}): string {
  const { lang } = opts;
  const label = sideLabel(opts.side, lang);
  if (lang === "en") {
    return [
      commonRules(opts.side, lang),
      ``,
      `# Task: research for the preparation phase (assigned to: ${opts.memberName})`,
      `Resolution: "${opts.topic}"`,
      `Your team is the ${label}.`,
      ``,
      `This is the preparation phase, so web research is allowed.`,
      `Research the resolution and gather arguments, data, and sources usable for the ${label} case, plus material to rebut the opponent's likely claims.`,
      `Organize what you find as claim + grounds + source (title, URL, publisher, date) together.`,
      ``,
      `As your final output, produce only research notes (headed bullet points) as text. Do not create any files.`,
    ].join("\n");
  }
  return [
    commonRules(opts.side, lang),
    ``,
    `# タスク: 準備フェーズの調査（担当: ${opts.memberName}）`,
    `論題: 「${opts.topic}」`,
    `あなたのチームは${label}です。`,
    ``,
    `いまは準備フェーズなので Web 調査が許可されています。`,
    `論題について調査し、${label}の立論に使える論点・データ・出典と、相手側の想定主張への反論材料を集めてください。`,
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
  lang: Lang;
}): string {
  const { lang } = opts;
  const p = evidencePrefix(opts.side);
  const label = sideLabel(opts.side, lang);
  if (lang === "en") {
    const notes = opts.researchNotes?.length
      ? [`# Research notes from team members`, ...opts.researchNotes.map((n, i) => `## Note ${i + 1}\n${n}`), ``]
      : [];
    return [
      commonRules(opts.side, lang),
      ``,
      `# Task: build the handout material`,
      `Resolution: "${opts.topic}"`,
      `Your team is the ${label}.`,
      ``,
      `Match flow:`,
      formatOverview(opts.format, lang),
      ``,
      ...notes,
      `This is the final step of the preparation phase. ${opts.researchNotes?.length ? "Consolidate the research notes above and " : "Do web research if needed and "}build the sealed handout you will cite during the debate.`,
      `After preparation ends, web research is forbidden and only this material counts as evidence. Include evidence for rebuttals and cross-examination, not just constructives.`,
      ``,
      `Create the following two files directly in the current directory.`,
      ``,
      `## 1. evidence.json`,
      `A JSON array of evidence entries. Each entry must follow this shape strictly.`,
      `Ids are sequential like "${p}-01", "${p}-02", roughly 6-10 entries.`,
      `\`\`\`json`,
      `[`,
      `  {`,
      `    "id": "${p}-01",`,
      `    "claim": "summary of the claim this evidence supports",`,
      `    "quote": "quote or paraphrase from the source (2-4 sentences)",`,
      `    "source": { "title": "source title", "url": "https://...", "publisher": "publisher", "publishedAt": "2024-05-01" },`,
      `    "accessedAt": "when you accessed it (ISO 8601)"`,
      `  }`,
      `]`,
      `\`\`\``,
      ``,
      `## 2. handout.md`,
      `A human-readable handout. Lay out the resolution, side, the main argument structure (advantages/disadvantages), and how each piece of evidence is used, in Markdown. Always note the corresponding ID for each piece of evidence.`,
      ``,
      `Once both files are written, print the list of evidence IDs you created on one line and finish.`,
    ].join("\n");
  }
  const notes = opts.researchNotes?.length
    ? [`# チームメンバーの調査メモ`, ...opts.researchNotes.map((n, i) => `## メモ${i + 1}\n${n}`), ``]
    : [];
  return [
    commonRules(opts.side, lang),
    ``,
    `# タスク: ハンドアウト資料の作成`,
    `論題: 「${opts.topic}」`,
    `あなたのチームは${label}です。`,
    ``,
    `試合の流れ:`,
    formatOverview(opts.format, lang),
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

export function prepFixPrompt(errors: string[], lang: Lang): string {
  if (lang === "en") {
    return [
      languageDirective(lang),
      `# Task: fix the handout artifacts`,
      `The evidence.json / handout.md in the current directory have the following problems. Fix them.`,
      ``,
      ...errors.map((e) => `- ${e}`),
      ``,
      `After fixing, print a one-line summary of what you changed and finish.`,
    ].join("\n");
  }
  return [
    languageDirective(lang),
    `# タスク: ハンドアウト成果物の修正`,
    `カレントディレクトリの evidence.json / handout.md に次の不備があります。修正してください。`,
    ``,
    ...errors.map((e) => `- ${e}`),
    ``,
    `修正後、修正内容を1行で出力して終了してください。`,
  ].join("\n");
}

/* ---------- Debate proper ---------- */

export interface SpeechContext {
  topic: string;
  side: Side;
  format: FormatDefinition;
  part: FormatPart;
  handoutMd: string;
  evidence: EvidenceEntry[];
  publicLog: SpeechEvent[];
  lang: Lang;
  exchangeIndex?: number;
  lastQuestion?: string;
}

function debateContext(ctx: SpeechContext): string {
  const { lang } = ctx;
  const label = sideLabel(ctx.side, lang);
  if (lang === "en") {
    return [
      commonRules(ctx.side, lang),
      ``,
      `Resolution: "${ctx.topic}"`,
      `Your team is the ${label}.`,
      ``,
      `Match flow:`,
      formatOverview(ctx.format, lang),
      ``,
      `# Your team's sealed handout`,
      ctx.handoutMd,
      ``,
      `# Sealed evidence list (you may cite only these IDs)`,
      renderEvidence(ctx.evidence, lang),
      ``,
      `# Match log so far`,
      renderPublicLog(ctx.publicLog, lang),
      ``,
      `This is the debate proper, so web search and fetching outside information are forbidden. You may only use the handout, evidence, and match log above.`,
    ].join("\n");
  }
  return [
    commonRules(ctx.side, lang),
    ``,
    `論題: 「${ctx.topic}」`,
    `あなたのチームは${label}です。`,
    ``,
    `試合の流れ:`,
    formatOverview(ctx.format, lang),
    ``,
    `# あなたのチームの封印済みハンドアウト`,
    ctx.handoutMd,
    ``,
    `# 封印済み証拠一覧（この ID 以外は引用できない）`,
    renderEvidence(ctx.evidence, lang),
    ``,
    `# ここまでの試合ログ`,
    renderPublicLog(ctx.publicLog, lang),
    ``,
    `いまはディベート本編中のため、Web 検索・外部情報の取得は禁止です。使える情報は上記のハンドアウト・証拠・試合ログに限られます。`,
  ].join("\n");
}

const KIND_DIRECTION: Record<Lang, Record<string, string>> = {
  ja: {
    constructive: `論点を整理し、メリット（肯定側）またはデメリット（否定側）を明確な構造（ラベル、内因性、重要性など）で提示してください。相手の立論が既にある場合は、それを意識した構成にしてください。`,
    rebuttal: `ここまでの相手の議論に反論し、自チームの議論を再構築してください。相手の証拠の弱点を指摘し、メリットとデメリットの比較で自チームが優位である理由を述べてください。新しい論点の提出はできません。`,
  },
  en: {
    constructive: `Organize your points and present the advantages (affirmative) or disadvantages (negative) in a clear structure (label, inherency, significance, etc.). If the opponent's constructive already exists, structure your case with it in mind.`,
    rebuttal: `Rebut the opponent's arguments so far and rebuild your own case. Point out weaknesses in the opponent's evidence and, comparing advantages and disadvantages, explain why your team prevails. You may not introduce new arguments.`,
  },
};

export function speechPrompt(ctx: SpeechContext): string {
  const { lang } = ctx;
  const direction = KIND_DIRECTION[lang][ctx.part.kind] ?? "";
  const label = partLabel(ctx.part.id, lang);
  if (lang === "en") {
    return [
      debateContext(ctx),
      ``,
      `# Task: ${label}`,
      direction,
      `Attach an evidence ID in the form [${evidencePrefix(ctx.side)}-01] to each factual claim, inline.`,
      `Output only the speech body, within ${ctx.part.maxChars} characters. No headings or preambles (e.g. "Here is my constructive"). ${langReminder(lang)}`,
    ].join("\n");
  }
  return [
    debateContext(ctx),
    ``,
    `# タスク: ${label}`,
    direction,
    `事実主張には証拠 ID を [${evidencePrefix(ctx.side)}-01] の形式で文中に付けてください。`,
    `${ctx.part.maxChars}字以内で、発言本文だけを出力してください。見出しや前置き（「以下が立論です」等）は不要です。${langReminder(lang)}`,
  ].join("\n");
}

export function questionPrompt(ctx: SpeechContext): string {
  const { lang } = ctx;
  const label = partLabel(ctx.part.id, lang);
  const n = (ctx.exchangeIndex ?? 0) + 1;
  if (lang === "en") {
    return [
      debateContext(ctx),
      ``,
      `# Task: ${label} (Question ${n}/${ctx.part.maxExchanges})`,
      `Ask exactly one question that undermines the opponent's immediately preceding constructive. Probe the grounds of their evidence, leaps in logic, or vague definitions.`,
      `Output only the question, within ${ctx.part.maxCharsPerUtterance} characters. ${langReminder(lang)}`,
    ].join("\n");
  }
  return [
    debateContext(ctx),
    ``,
    `# タスク: ${label}（質問 ${n}/${ctx.part.maxExchanges}）`,
    `直前の相手の立論について、議論を崩すための質問を1つだけしてください。相手の証拠の根拠、論理の飛躍、定義の曖昧さなどを突くこと。`,
    `${ctx.part.maxCharsPerUtterance}字以内で、質問文だけを出力してください。${langReminder(lang)}`,
  ].join("\n");
}

export function answerPrompt(ctx: SpeechContext): string {
  const { lang } = ctx;
  const n = (ctx.exchangeIndex ?? 0) + 1;
  if (lang === "en") {
    return [
      debateContext(ctx),
      ``,
      `# Task: cross-examination (Answer ${n}/${ctx.part.maxExchanges})`,
      `Answer the opponent's next question.`,
      ``,
      `Question: ${ctx.lastQuestion ?? "(the preceding question)"}`,
      ``,
      `Answer concisely and honestly, based on your own constructive and evidence. Cite evidence IDs where needed.`,
      `Output only the answer, within ${ctx.part.maxCharsPerUtterance} characters. ${langReminder(lang)}`,
    ].join("\n");
  }
  return [
    debateContext(ctx),
    ``,
    `# タスク: 質疑応答（応答 ${n}/${ctx.part.maxExchanges}）`,
    `相手からの次の質問に答えてください。`,
    ``,
    `質問: ${ctx.lastQuestion ?? "（直前の質問）"}`,
    ``,
    `自チームの立論と証拠に基づき、簡潔かつ誠実に答えてください。必要なら証拠 ID を引用してください。`,
    `${ctx.part.maxCharsPerUtterance}字以内で、応答本文だけを出力してください。${langReminder(lang)}`,
  ].join("\n");
}

export function draftNote(memberName: string, lang: Lang): string {
  if (lang === "en") {
    return `\n\n(Note: this is a draft for the team's internal deliberation. Produce your draft as ${memberName}; the captain will merge them. Output only the draft body in the format above.)`;
  }
  return `\n\n（注: これはチーム内合議用の草案作成です。あなたは ${memberName} として草案を出し、captain が統合します。上記の形式で草案本文だけを出力してください。）`;
}

export function mergePrompt(opts: {
  ctx: SpeechContext;
  drafts: { memberName: string; text: string }[];
  taskLabel: string;
  maxChars: number;
}): string {
  const { lang } = opts.ctx;
  if (lang === "en") {
    return [
      debateContext(opts.ctx),
      ``,
      `# Task: finalize the ${opts.taskLabel} (you are the captain)`,
      `Your team members produced the following drafts.`,
      ``,
      ...opts.drafts.map((d) => `## Draft by ${d.memberName}\n${d.text}`),
      ``,
      `Merge the best parts of the drafts into a single, coherent team speech.`,
      `Keep the citation form [${evidencePrefix(opts.ctx.side)}-01], and output only the speech body within ${opts.maxChars} characters. ${langReminder(lang)}`,
    ].join("\n");
  }
  return [
    debateContext(opts.ctx),
    ``,
    `# タスク: ${opts.taskLabel} の最終化（あなたは captain）`,
    `チームメンバーが次の草案を出しました。`,
    ``,
    ...opts.drafts.map((d) => `## ${d.memberName} の草案\n${d.text}`),
    ``,
    `草案の良い部分を統合し、一貫性のあるチームとしての最終発言を作ってください。`,
    `証拠 ID の引用形式 [${evidencePrefix(opts.ctx.side)}-01] を守り、${opts.maxChars}字以内で発言本文だけを出力してください。${langReminder(lang)}`,
  ].join("\n");
}

export function strategistReviewPrompt(opts: {
  ctx: SpeechContext;
  draft: string;
  taskLabel: string;
  maxChars: number;
}): string {
  const { lang } = opts.ctx;
  if (lang === "en") {
    return [
      debateContext(opts.ctx),
      ``,
      `# Task: final check of the ${opts.taskLabel} (you are the strategist)`,
      `The assigned member produced the following draft speech.`,
      ``,
      opts.draft,
      ``,
      `Review it from a team-strategy standpoint (consistency of arguments, use of evidence, responsiveness to the opponent) and output a final version with any needed edits.`,
      `If there are no problems you may output it unchanged. Output only the speech body within ${opts.maxChars} characters. ${langReminder(lang)}`,
    ].join("\n");
  }
  return [
    debateContext(opts.ctx),
    ``,
    `# タスク: ${opts.taskLabel} の最終確認（あなたは戦略統括）`,
    `担当者が次の発言案を作りました。`,
    ``,
    opts.draft,
    ``,
    `チーム戦略の観点（論点の一貫性、証拠の使い方、相手への応答性）で確認し、必要な修正を加えた最終版を出力してください。`,
    `問題がなければそのまま出力して構いません。${opts.maxChars}字以内で発言本文だけを出力してください。${langReminder(lang)}`,
  ].join("\n");
}

export function regeneratePrompt(original: string, maxChars: number, lang: Lang): string {
  if (lang === "en") {
    return [
      languageDirective(lang),
      `Your previous draft exceeds the character limit of ${maxChars}.`,
      `Keeping the key content, output only the speech body within ${maxChars} characters. Keep the evidence-ID citations. ${langReminder(lang)}`,
      ``,
      `# Previous draft`,
      PREVIOUS_DRAFT_MARKER,
      original,
    ].join("\n");
  }
  return [
    languageDirective(lang),
    `あなたの直前の発言案は文字数上限 ${maxChars} 字を超えています。`,
    `内容の要点を維持したまま、${maxChars}字以内に収めた発言本文だけを出力してください。証拠 ID の引用は維持してください。${langReminder(lang)}`,
    ``,
    `# 直前の発言案`,
    PREVIOUS_DRAFT_MARKER,
    original,
  ].join("\n");
}

/* ---------- Judging ---------- */

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
  lang: Lang;
}): string {
  const { lang } = opts;
  if (lang === "en") {
    return [
      languageDirective(lang),
      `You are a judge in the "Coding-Agent Debate Koshien".`,
      `Following the judging criteria of Japan's National Middle/High School Debate Championship ("Debate Koshien"), reach a verdict independently. You cannot consult the other judges.`,
      ``,
      `# Judging criteria`,
      `- Judge only on the arguments presented in the match (do not supplement with your own knowledge)`,
      `- Weigh the affirmative's advantages against the negative's disadvantages and decide who prevails`,
      `- No draws. You must vote for one side`,
      `- Evaluate the soundness of constructives, the effectiveness of cross-examination and rebuttals, and the reliability of the evidence`,
      `- Check that the grounds of each speech stay within the sealed handout. New evidence not in the material, or factual claims with no grounds, are treated unfavorably`,
      `- Assess communication by clarity of argument, responsiveness to the opponent, how well the cross-examination engaged, and the clarity of comparison`,
      ``,
      `# Resolution`,
      `"${opts.topic}"`,
      ``,
      `# Match format`,
      formatOverview(opts.format, lang),
      ``,
      `# Affirmative's sealed handout`,
      opts.affirmativeHandout,
      ``,
      `# Affirmative's evidence list`,
      renderEvidence(opts.affirmativeEvidence, lang),
      ``,
      `# Negative's sealed handout`,
      opts.negativeHandout,
      ``,
      `# Negative's evidence list`,
      renderEvidence(opts.negativeEvidence, lang),
      ``,
      `# Match log (all speeches)`,
      renderPublicLog(opts.publicLog, lang),
      ``,
      `# App-side formal checks`,
      `Hash verification: ${opts.hashChecks.join(" / ") || "no record"}`,
      `Warnings: ${opts.warnings.length ? opts.warnings.map((w) => `\n- ${w}`).join("") : "none"}`,
      ``,
      `# Output format`,
      `Output only the following JSON. No prose (preamble, code fences) whatsoever. Write all natural-language string values (decisiveIssues, comments, reasoning, etc.) in English.`,
      `{`,
      `  "vote": "affirmative" or "negative",`,
      `  "decisiveIssues": ["analysis of the issues that decided the match (1-3)"],`,
      `  "speechEvaluations": [{ "partId": "1AC", "comment": "evaluation of each part" }],`,
      `  "evidenceAssessment": [{ "evidenceId": "A-01", "reliability": "high/medium/low", "comment": "assessment" }],`,
      `  "violations": [{ "type": "e.g. unsupported-claim", "partId": "relevant part", "detail": "content" }],`,
      `  "communication": { "clarity": "assessment", "responsiveness": "assessment", "comment": "overall" },`,
      `  "reasoning": "summary of the verdict rationale (including the weighing process)"`,
      `}`,
    ].join("\n");
  }
  return [
    languageDirective(lang),
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
    formatOverview(opts.format, lang),
    ``,
    `# 肯定側の封印済みハンドアウト`,
    opts.affirmativeHandout,
    ``,
    `# 肯定側の証拠一覧`,
    renderEvidence(opts.affirmativeEvidence, lang),
    ``,
    `# 否定側の封印済みハンドアウト`,
    opts.negativeHandout,
    ``,
    `# 否定側の証拠一覧`,
    renderEvidence(opts.negativeEvidence, lang),
    ``,
    `# 試合ログ（全発言）`,
    renderPublicLog(opts.publicLog, lang),
    ``,
    `# アプリによる形式チェック結果`,
    `ハッシュ検証: ${opts.hashChecks.join(" / ") || "実施記録なし"}`,
    `警告: ${opts.warnings.length ? opts.warnings.map((w) => `\n- ${w}`).join("") : "なし"}`,
    ``,
    `# 出力形式`,
    `次の JSON だけを出力してください。JSON 以外の文章（前置き、コードフェンス）は一切不要です。文字列値（decisiveIssues・各 comment・reasoning など）はすべて日本語で書いてください。`,
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

/* ---------- Post-match review ---------- */

export function reviewPrompt(opts: {
  topic: string;
  format: FormatDefinition;
  publicLog: SpeechEvent[];
  deliberations: string;
  verdictsJson: string;
  affirmativeTeamName: string;
  negativeTeamName: string;
  teamAKey: "affirmative" | "negative";
  lang: Lang;
}): string {
  const { lang } = opts;
  if (lang === "en") {
    const teamASide = opts.teamAKey === "affirmative" ? "affirmative" : "negative";
    return [
      languageDirective(lang),
      `You are the commentator for the "Coding-Agent Debate Koshien". Write the post-match review.`,
      `Unlike the judges, you can also see each team's internal deliberation log.`,
      ``,
      `# Resolution`,
      `"${opts.topic}"`,
      ``,
      `# Match log (all speeches)`,
      renderPublicLog(opts.publicLog, lang),
      ``,
      `# Team deliberation logs (for spectators; not used in judging)`,
      opts.deliberations || "(no record)",
      ``,
      `# Judges' verdicts (JSON)`,
      opts.verdictsJson,
      ``,
      `Team A is the ${teamASide} (${opts.affirmativeTeamName} is affirmative / ${opts.negativeTeamName} is negative).`,
      ``,
      `# Output format`,
      `Output only the following JSON. No prose whatsoever. Write all natural-language string values in English. The keys of "improvements" are "A" and "B" (team keys).`,
      `{`,
      `  "decisiveIssues": ["which issues decided the match"],`,
      `  "turningPoints": ["which parts shifted the momentum"],`,
      `  "strongEvidence": [{ "evidenceId": "A-01", "comment": "why it was strong" }],`,
      `  "weakEvidence": [{ "evidenceId": "N-02", "comment": "why it was weak" }],`,
      `  "effectiveRebuttals": ["rebuttals that were effective"],`,
      `  "suspectedOutOfHandout": ["claims suspected to be outside the handout (empty array if none)"],`,
      `  "judgeDifferences": "analysis of the differences between judges",`,
      `  "preparationComparison": "comparison of the quality of both teams' preparation material",`,
      `  "teamOperationComparison": "how the difference in team operation mode (council / role-division) played out",`,
      `  "improvements": { "A": ["improvements for team A"], "B": ["improvements for team B"] }`,
      `}`,
    ].join("\n");
  }
  return [
    languageDirective(lang),
    `あなたは「コーディングエージェント対抗 ディベート甲子園」の解説者です。試合終了後の感想戦レビューを作成してください。`,
    `あなたは審査員と違い、各チームの内部合議ログも見ることができます。`,
    ``,
    `# 論題`,
    `「${opts.topic}」`,
    ``,
    `# 試合ログ（全発言）`,
    renderPublicLog(opts.publicLog, lang),
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
    `次の JSON だけを出力してください。JSON 以外の文章は一切不要です。文字列値はすべて日本語で書いてください。improvements のキーは "A" と "B"（チームキー）です。`,
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

import type { Lang, MemberRole, Phase, Side, WarningKind } from "./types.js";

/**
 * Cross-cutting, language-dependent labels shared by the server (prompts, emitted status text)
 * and the web UI (chrome). Match-content labels (side / role / part / phase / warning) and the
 * per-format display strings live here, keyed by a stable enum value or id, so that both ends
 * render the exact same wording for a given language.
 */

export const DEFAULT_LANG: Lang = "ja";

export const LANG_LABEL: Record<Lang, string> = {
  ja: "日本語",
  en: "English",
};

const SIDE: Record<Lang, Record<Side, string>> = {
  ja: { affirmative: "肯定側", negative: "否定側" },
  en: { affirmative: "Affirmative", negative: "Negative" },
};

const ROLE: Record<Lang, Record<MemberRole, string>> = {
  ja: {
    researcher: "調査担当",
    constructive: "立論担当",
    questioner: "質疑担当",
    rebuttal: "反駁担当",
    strategist: "戦略統括",
  },
  en: {
    researcher: "Researcher",
    constructive: "Constructive",
    questioner: "Cross-examiner",
    rebuttal: "Rebuttal",
    strategist: "Strategist",
  },
};

const PHASE: Record<Lang, Record<Phase, string>> = {
  ja: {
    setup: "未開始",
    preparing: "準備中",
    sealed: "封印済み",
    debating: "試合中",
    judging: "審査中",
    reviewing: "講評中",
    finished: "終了",
    aborted: "中断",
    error: "エラー",
  },
  en: {
    setup: "Not started",
    preparing: "Preparing",
    sealed: "Sealed",
    debating: "In progress",
    judging: "Judging",
    reviewing: "Reviewing",
    finished: "Finished",
    aborted: "Aborted",
    error: "Error",
  },
};

const WARNING: Record<Lang, Record<WarningKind, string>> = {
  ja: {
    "unknown-evidence": "未知の証拠 ID",
    "over-length": "文字数超過",
    "no-citation": "証拠参照なし",
    "web-tool-used": "Web ツール使用",
    "hash-mismatch": "ハッシュ不一致",
    "generation-error": "生成エラー",
  },
  en: {
    "unknown-evidence": "Unknown evidence ID",
    "over-length": "Over length",
    "no-citation": "No citation",
    "web-tool-used": "Web tool used",
    "hash-mismatch": "Hash mismatch",
    "generation-error": "Generation error",
  },
};

/** Part labels, keyed by part id (stable across every format). */
const PART: Record<Lang, Record<string, string>> = {
  ja: {
    "1AC": "肯定側立論",
    NQ: "否定側質疑",
    "1NC": "否定側立論",
    AQ: "肯定側質疑",
    "1NR": "否定側第一反駁",
    "1AR": "肯定側第一反駁",
    "2NR": "否定側第二反駁",
    "2AR": "肯定側第二反駁",
  },
  en: {
    "1AC": "Affirmative Constructive",
    NQ: "Negative Cross-examination",
    "1NC": "Negative Constructive",
    AQ: "Affirmative Cross-examination",
    "1NR": "Negative 1st Rebuttal",
    "1AR": "Affirmative 1st Rebuttal",
    "2NR": "Negative 2nd Rebuttal",
    "2AR": "Affirmative 2nd Rebuttal",
  },
};

/** Short part labels for the compact progress indicator, keyed by part id. */
const PART_SHORT: Record<Lang, Record<string, string>> = {
  ja: {
    "1AC": "肯定立論",
    NQ: "否定質疑",
    "1NC": "否定立論",
    AQ: "肯定質疑",
    "1NR": "否定一反",
    "1AR": "肯定一反",
    "2NR": "否定二反",
    "2AR": "肯定二反",
  },
  en: {
    "1AC": "Aff Con",
    NQ: "Neg CX",
    "1NC": "Neg Con",
    AQ: "Aff CX",
    "1NR": "Neg 1R",
    "1AR": "Aff 1R",
    "2NR": "Neg 2R",
    "2AR": "Aff 2R",
  },
};

/** Format display name + short description, keyed by format id. */
const FORMAT: Record<Lang, Record<string, { name: string; description: string }>> = {
  ja: {
    "koshien-high": {
      name: "ディベート甲子園（高校の部相当）",
      description: "立論2400字 / 質疑5往復 / 反駁1600字",
    },
    "koshien-middle": {
      name: "ディベート甲子園（中学の部相当）",
      description: "立論1600字 / 質疑4往復 / 反駁1200字",
    },
    quick: {
      name: "クイック（動作確認用）",
      description: "立論600字 / 質疑2往復 / 反駁400字",
    },
  },
  en: {
    "koshien-high": {
      name: "Debate Koshien (High-school division)",
      description: "Constructive 2400 chars / 5 exchanges / Rebuttal 1600 chars",
    },
    "koshien-middle": {
      name: "Debate Koshien (Middle-school division)",
      description: "Constructive 1600 chars / 4 exchanges / Rebuttal 1200 chars",
    },
    quick: {
      name: "Quick (smoke test)",
      description: "Constructive 600 chars / 2 exchanges / Rebuttal 400 chars",
    },
  },
};

export function sideLabel(side: Side, lang: Lang): string {
  return SIDE[lang][side];
}

export function roleLabel(role: MemberRole, lang: Lang): string {
  return ROLE[lang][role];
}

export function phaseLabel(phase: Phase, lang: Lang): string {
  return PHASE[lang][phase];
}

export function warningKindLabel(kind: WarningKind, lang: Lang): string {
  return WARNING[lang][kind];
}

export function partLabel(partId: string, lang: Lang): string {
  return PART[lang][partId] ?? partId;
}

export function partShortLabel(partId: string, lang: Lang): string {
  return PART_SHORT[lang][partId] ?? PART[lang][partId] ?? partId;
}

export function formatName(formatId: string, lang: Lang): string {
  return FORMAT[lang][formatId]?.name ?? formatId;
}

export function formatDescription(formatId: string, lang: Lang): string {
  return FORMAT[lang][formatId]?.description ?? "";
}

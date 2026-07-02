import type { FormatDefinition } from "./types.js";

/**
 * ディベート甲子園の発言順序（肯定立論 → 否定質疑 → 否定立論 → 肯定質疑 →
 * 否定第一反駁 → 肯定第一反駁 → 否定第二反駁 → 肯定第二反駁）。
 * 時間制はターン制に置き換え、発言時間は文字数上限、質疑は往復数で制限する。
 * 部門差は数値の差としてフォーマット定義で吸収する。
 */
export const FORMATS: FormatDefinition[] = [
  {
    id: "koshien-high",
    name: "ディベート甲子園（高校の部相当）",
    description: "立論2400字 / 質疑5往復 / 反駁1600字",
    parts: [
      { id: "1AC", label: "肯定側立論", side: "affirmative", kind: "constructive", maxChars: 2400 },
      { id: "NQ", label: "否定側質疑", side: "negative", kind: "cross-examination", maxExchanges: 5, maxCharsPerUtterance: 300 },
      { id: "1NC", label: "否定側立論", side: "negative", kind: "constructive", maxChars: 2400 },
      { id: "AQ", label: "肯定側質疑", side: "affirmative", kind: "cross-examination", maxExchanges: 5, maxCharsPerUtterance: 300 },
      { id: "1NR", label: "否定側第一反駁", side: "negative", kind: "rebuttal", maxChars: 1600 },
      { id: "1AR", label: "肯定側第一反駁", side: "affirmative", kind: "rebuttal", maxChars: 1600 },
      { id: "2NR", label: "否定側第二反駁", side: "negative", kind: "rebuttal", maxChars: 1600 },
      { id: "2AR", label: "肯定側第二反駁", side: "affirmative", kind: "rebuttal", maxChars: 1600 },
    ],
  },
  {
    id: "koshien-middle",
    name: "ディベート甲子園（中学の部相当）",
    description: "立論1600字 / 質疑4往復 / 反駁1200字",
    parts: [
      { id: "1AC", label: "肯定側立論", side: "affirmative", kind: "constructive", maxChars: 1600 },
      { id: "NQ", label: "否定側質疑", side: "negative", kind: "cross-examination", maxExchanges: 4, maxCharsPerUtterance: 250 },
      { id: "1NC", label: "否定側立論", side: "negative", kind: "constructive", maxChars: 1600 },
      { id: "AQ", label: "肯定側質疑", side: "affirmative", kind: "cross-examination", maxExchanges: 4, maxCharsPerUtterance: 250 },
      { id: "1NR", label: "否定側第一反駁", side: "negative", kind: "rebuttal", maxChars: 1200 },
      { id: "1AR", label: "肯定側第一反駁", side: "affirmative", kind: "rebuttal", maxChars: 1200 },
      { id: "2NR", label: "否定側第二反駁", side: "negative", kind: "rebuttal", maxChars: 1200 },
      { id: "2AR", label: "肯定側第二反駁", side: "affirmative", kind: "rebuttal", maxChars: 1200 },
    ],
  },
  {
    id: "quick",
    name: "クイック（動作確認用）",
    description: "立論600字 / 質疑2往復 / 反駁400字",
    parts: [
      { id: "1AC", label: "肯定側立論", side: "affirmative", kind: "constructive", maxChars: 600 },
      { id: "NQ", label: "否定側質疑", side: "negative", kind: "cross-examination", maxExchanges: 2, maxCharsPerUtterance: 200 },
      { id: "1NC", label: "否定側立論", side: "negative", kind: "constructive", maxChars: 600 },
      { id: "AQ", label: "肯定側質疑", side: "affirmative", kind: "cross-examination", maxExchanges: 2, maxCharsPerUtterance: 200 },
      { id: "1NR", label: "否定側第一反駁", side: "negative", kind: "rebuttal", maxChars: 400 },
      { id: "1AR", label: "肯定側第一反駁", side: "affirmative", kind: "rebuttal", maxChars: 400 },
      { id: "2NR", label: "否定側第二反駁", side: "negative", kind: "rebuttal", maxChars: 400 },
      { id: "2AR", label: "肯定側第二反駁", side: "affirmative", kind: "rebuttal", maxChars: 400 },
    ],
  },
];

export function getFormat(id: string): FormatDefinition {
  const f = FORMATS.find((f) => f.id === id);
  if (!f) throw new Error(`unknown format: ${id}`);
  return f;
}

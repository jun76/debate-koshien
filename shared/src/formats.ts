import type { FormatDefinition } from "./types.js";

/**
 * Debate Koshien speaking order (affirmative constructive -> negative cross-examination ->
 * negative constructive -> affirmative cross-examination -> negative first rebuttal ->
 * affirmative first rebuttal -> negative second rebuttal -> affirmative second rebuttal).
 * The time limits are replaced with turn-based limits: speeches by character count,
 * cross-examinations by number of exchanges. Division differences are absorbed as numeric
 * differences in the format definition. Display strings live in the i18n module.
 */
export const FORMATS: FormatDefinition[] = [
  {
    id: "koshien-high",
    parts: [
      { id: "1AC", side: "affirmative", kind: "constructive", maxChars: 2400 },
      { id: "NQ", side: "negative", kind: "cross-examination", maxExchanges: 5, maxCharsPerUtterance: 300 },
      { id: "1NC", side: "negative", kind: "constructive", maxChars: 2400 },
      { id: "AQ", side: "affirmative", kind: "cross-examination", maxExchanges: 5, maxCharsPerUtterance: 300 },
      { id: "1NR", side: "negative", kind: "rebuttal", maxChars: 1600 },
      { id: "1AR", side: "affirmative", kind: "rebuttal", maxChars: 1600 },
      { id: "2NR", side: "negative", kind: "rebuttal", maxChars: 1600 },
      { id: "2AR", side: "affirmative", kind: "rebuttal", maxChars: 1600 },
    ],
  },
  {
    id: "koshien-middle",
    parts: [
      { id: "1AC", side: "affirmative", kind: "constructive", maxChars: 1600 },
      { id: "NQ", side: "negative", kind: "cross-examination", maxExchanges: 4, maxCharsPerUtterance: 250 },
      { id: "1NC", side: "negative", kind: "constructive", maxChars: 1600 },
      { id: "AQ", side: "affirmative", kind: "cross-examination", maxExchanges: 4, maxCharsPerUtterance: 250 },
      { id: "1NR", side: "negative", kind: "rebuttal", maxChars: 1200 },
      { id: "1AR", side: "affirmative", kind: "rebuttal", maxChars: 1200 },
      { id: "2NR", side: "negative", kind: "rebuttal", maxChars: 1200 },
      { id: "2AR", side: "affirmative", kind: "rebuttal", maxChars: 1200 },
    ],
  },
  {
    id: "quick",
    parts: [
      { id: "1AC", side: "affirmative", kind: "constructive", maxChars: 600 },
      { id: "NQ", side: "negative", kind: "cross-examination", maxExchanges: 2, maxCharsPerUtterance: 200 },
      { id: "1NC", side: "negative", kind: "constructive", maxChars: 600 },
      { id: "AQ", side: "affirmative", kind: "cross-examination", maxExchanges: 2, maxCharsPerUtterance: 200 },
      { id: "1NR", side: "negative", kind: "rebuttal", maxChars: 400 },
      { id: "1AR", side: "affirmative", kind: "rebuttal", maxChars: 400 },
      { id: "2NR", side: "negative", kind: "rebuttal", maxChars: 400 },
      { id: "2AR", side: "affirmative", kind: "rebuttal", maxChars: 400 },
    ],
  },
];

export function getFormat(id: string): FormatDefinition {
  const f = FORMATS.find((f) => f.id === id);
  if (!f) throw new Error(`unknown format: ${id}`);
  return f;
}

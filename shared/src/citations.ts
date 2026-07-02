import type { Side } from "./types.js";

/** 証拠 ID の接頭辞。肯定側 A-nn、否定側 N-nn。 */
export function evidencePrefix(side: Side): "A" | "N" {
  return side === "affirmative" ? "A" : "N";
}

const CITATION_RE = /\[([AN]-\d{2})\]/g;

/** 発言テキストから証拠参照マーカーを抽出する（重複除去、出現順） */
export function extractCitations(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(CITATION_RE)) {
    seen.add(m[1]);
  }
  return [...seen];
}

/** 証拠 ID がその立場の形式に合っているか */
export function isValidEvidenceId(id: string, side: Side): boolean {
  return new RegExp(`^${evidencePrefix(side)}-\\d{2}$`).test(id);
}

/** 文字数（コードポイント基準） */
export function countChars(text: string): number {
  return [...text].length;
}

/** 文字数上限で切り詰める */
export function truncateChars(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("");
}

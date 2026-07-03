import type { Side } from "./types.js";

/** Evidence-ID prefix: affirmative A-nn, negative N-nn. */
export function evidencePrefix(side: Side): "A" | "N" {
  return side === "affirmative" ? "A" : "N";
}

const CITATION_RE = /\[([AN]-\d{2})\]/g;

/** Extract evidence-reference markers from a speech (deduplicated, in order of appearance). */
export function extractCitations(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(CITATION_RE)) {
    seen.add(m[1]);
  }
  return [...seen];
}

/** Whether an evidence ID matches the format for that side. */
export function isValidEvidenceId(id: string, side: Side): boolean {
  return new RegExp(`^${evidencePrefix(side)}-\\d{2}$`).test(id);
}

/** Character count (by code point). */
export function countChars(text: string): number {
  return [...text].length;
}

/** Truncate to a maximum character count. */
export function truncateChars(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("");
}

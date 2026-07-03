import {
  countChars,
  extractCitations,
  type EvidenceEntry,
  type FormatPart,
  type Lang,
  type Side,
  type SpeechWarning,
} from "@debate/shared";
import type { ToolUsageRecord } from "./adapters/types.js";
import { serverStrings } from "./i18n.js";

const WEB_TOOL_NAMES = ["websearch", "webfetch", "web_search", "web_fetch", "fetch", "browser"];

export function detectWebToolUsage(usage: ToolUsageRecord[]): string[] {
  return usage
    .filter((u) => WEB_TOOL_NAMES.some((w) => u.name.toLowerCase().includes(w)))
    .map((u) => u.name);
}

export interface SpeechCheckResult {
  citations: string[];
  warnings: SpeechWarning[];
}

/**
 * Formal check of a speech.
 * - Whether the cited evidence IDs exist in the sealed evidence.json
 *   (mentioning the opponent's evidence IDs is allowed as legitimate rebuttal reference).
 * - Character limit (truncation is assumed already done by the caller; only warns of the excess).
 * - Whether constructives / rebuttals have at least one evidence citation.
 */
export function checkSpeech(opts: {
  text: string;
  side: Side;
  kind: "constructive" | "rebuttal" | "question" | "answer";
  part: FormatPart;
  lang: Lang;
  ownEvidence: EvidenceEntry[];
  opponentEvidence?: EvidenceEntry[];
  overLengthOriginal?: number;
  webToolsUsed?: string[];
}): SpeechCheckResult {
  const t = serverStrings(opts.lang);
  const warnings: SpeechWarning[] = [];
  const citations = extractCitations(opts.text);
  const known = new Set([...opts.ownEvidence, ...(opts.opponentEvidence ?? [])].map((e) => e.id));

  for (const c of citations) {
    if (!known.has(c)) {
      warnings.push({ kind: "unknown-evidence", detail: t.warnUnknownEvidence(c) });
    }
  }

  const max =
    opts.kind === "question" || opts.kind === "answer"
      ? opts.part.maxCharsPerUtterance
      : opts.part.maxChars;
  if (opts.overLengthOriginal !== undefined && max !== undefined) {
    warnings.push({ kind: "over-length", detail: t.warnOverLength(max, opts.overLengthOriginal) });
  }

  if ((opts.kind === "constructive" || opts.kind === "rebuttal") && citations.length === 0) {
    warnings.push({ kind: "no-citation", detail: t.warnNoCitation });
  }

  for (const name of opts.webToolsUsed ?? []) {
    warnings.push({ kind: "web-tool-used", detail: t.warnWebTool(name) });
  }

  return { citations, warnings };
}

/** Schema validation of evidence.json. Returns an array of error messages (empty = valid). */
export function validateEvidence(raw: unknown, side: Side, lang: Lang): string[] {
  const t = serverStrings(lang);
  const errors: string[] = [];
  if (!Array.isArray(raw)) return [t.evidenceNotArray];
  if (raw.length === 0) errors.push(t.evidenceEmpty);
  const prefix = side === "affirmative" ? "A" : "N";
  const seen = new Set<string>();
  raw.forEach((e, i) => {
    if (typeof e !== "object" || e === null) {
      errors.push(t.evidenceNotObject(i));
      return;
    }
    const entry = e as Record<string, unknown>;
    const id = entry.id;
    if (typeof id !== "string" || !new RegExp(`^${prefix}-\\d{2}$`).test(id)) {
      errors.push(t.evidenceBadId(i, prefix, JSON.stringify(id)));
    } else if (seen.has(id)) {
      errors.push(t.evidenceDupId(i, id));
    } else {
      seen.add(id);
    }
    if (typeof entry.claim !== "string" || entry.claim.length === 0) {
      errors.push(t.evidenceNoClaim(i));
    }
    if (typeof entry.quote !== "string" || entry.quote.length === 0) {
      errors.push(t.evidenceNoQuote(i));
    }
    const src = entry.source as Record<string, unknown> | undefined;
    if (typeof src !== "object" || src === null || typeof src.title !== "string") {
      errors.push(t.evidenceNoSourceTitle(i));
    }
  });
  return errors;
}

export function parseEvidence(json: string, side: Side, lang: Lang): { evidence: EvidenceEntry[]; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { evidence: [], errors: [serverStrings(lang).evidenceBadJson((e as Error).message)] };
  }
  const errors = validateEvidence(raw, side, lang);
  return { evidence: errors.length === 0 ? (raw as EvidenceEntry[]) : [], errors };
}

export { countChars };

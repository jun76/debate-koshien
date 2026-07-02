import {
  countChars,
  extractCitations,
  type EvidenceEntry,
  type FormatPart,
  type Side,
  type SpeechWarning,
} from "@debate/shared";
import type { ToolUsageRecord } from "./adapters/types.js";

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
 * 発言の形式チェック。
 * - 参照された証拠 ID が封印済み evidence.json に存在するか
 *   （相手チームの証拠 ID への言及は、反論のための正当な参照として許可する）
 * - 文字数上限（超過分の切り詰めは呼び出し側で実施済みの前提で、超過事実の警告のみ）
 * - 立論・反駁で証拠参照がゼロでないか
 */
export function checkSpeech(opts: {
  text: string;
  side: Side;
  kind: "constructive" | "rebuttal" | "question" | "answer";
  part: FormatPart;
  ownEvidence: EvidenceEntry[];
  opponentEvidence?: EvidenceEntry[];
  overLengthOriginal?: number;
  webToolsUsed?: string[];
}): SpeechCheckResult {
  const warnings: SpeechWarning[] = [];
  const citations = extractCitations(opts.text);
  const known = new Set([...opts.ownEvidence, ...(opts.opponentEvidence ?? [])].map((e) => e.id));

  for (const c of citations) {
    if (!known.has(c)) {
      warnings.push({
        kind: "unknown-evidence",
        detail: `封印済み資料に存在しない証拠 ID [${c}] を参照した`,
      });
    }
  }

  const max =
    opts.kind === "question" || opts.kind === "answer"
      ? opts.part.maxCharsPerUtterance
      : opts.part.maxChars;
  if (opts.overLengthOriginal !== undefined && max !== undefined) {
    warnings.push({
      kind: "over-length",
      detail: `文字数上限 ${max} を超過（${opts.overLengthOriginal}字）したため切り詰めた`,
    });
  }

  if ((opts.kind === "constructive" || opts.kind === "rebuttal") && citations.length === 0) {
    warnings.push({
      kind: "no-citation",
      detail: "証拠参照のない発言（事実主張の根拠が確認できない）",
    });
  }

  for (const name of opts.webToolsUsed ?? []) {
    warnings.push({
      kind: "web-tool-used",
      detail: `ディベート本編中に Web 系ツール（${name}）の使用が記録された`,
    });
  }

  return { citations, warnings };
}

/** evidence.json のスキーマ検証。エラーメッセージの配列を返す（空なら合格） */
export function validateEvidence(raw: unknown, side: Side): string[] {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return ["evidence.json はエントリの配列である必要がある"];
  if (raw.length === 0) errors.push("証拠エントリが1件もない");
  const prefix = side === "affirmative" ? "A" : "N";
  const seen = new Set<string>();
  raw.forEach((e, i) => {
    if (typeof e !== "object" || e === null) {
      errors.push(`[${i}] オブジェクトではない`);
      return;
    }
    const entry = e as Record<string, unknown>;
    const id = entry.id;
    if (typeof id !== "string" || !new RegExp(`^${prefix}-\\d{2}$`).test(id)) {
      errors.push(`[${i}] id は「${prefix}-01」形式の文字列である必要がある（実際: ${JSON.stringify(id)}）`);
    } else if (seen.has(id)) {
      errors.push(`[${i}] id ${id} が重複している`);
    } else {
      seen.add(id);
    }
    if (typeof entry.claim !== "string" || entry.claim.length === 0) {
      errors.push(`[${i}] claim（この証拠が支える主張）が必要`);
    }
    if (typeof entry.quote !== "string" || entry.quote.length === 0) {
      errors.push(`[${i}] quote（出典からの引用・要約）が必要`);
    }
    const src = entry.source as Record<string, unknown> | undefined;
    if (typeof src !== "object" || src === null || typeof src.title !== "string") {
      errors.push(`[${i}] source.title（出典タイトル）が必要`);
    }
  });
  return errors;
}

export function parseEvidence(json: string, side: Side): { evidence: EvidenceEntry[]; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { evidence: [], errors: [`evidence.json が JSON として不正: ${(e as Error).message}`] };
  }
  const errors = validateEvidence(raw, side);
  return { evidence: errors.length === 0 ? (raw as EvidenceEntry[]) : [], errors };
}

export { countChars };

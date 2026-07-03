import { describe, expect, it } from "vitest";
import { extractCitations, getFormat, type EvidenceEntry } from "@debate/shared";
import { checkSpeech, detectWebToolUsage, parseEvidence } from "../src/checks.js";

const part = getFormat("koshien-high").parts[0]; // 1AC constructive, maxChars 2400

const evidence: EvidenceEntry[] = [
  { id: "A-01", claim: "c", quote: "q", source: { title: "t" } },
  { id: "A-02", claim: "c", quote: "q", source: { title: "t" } },
];

describe("extractCitations", () => {
  it("extracts markers in order without duplicates", () => {
    expect(extractCitations("本文 [A-01] と [A-02]、再び [A-01]。")).toEqual(["A-01", "A-02"]);
  });
  it("ignores malformed markers", () => {
    expect(extractCitations("[A-1] [B-01] [A-001]")).toEqual([]);
  });
});

describe("checkSpeech", () => {
  it("warns about a nonexistent evidence ID", () => {
    const res = checkSpeech({
      text: "主張 [A-01] と [A-99]。",
      side: "affirmative",
      kind: "constructive",
      part,
      lang: "ja",
      ownEvidence: evidence,
    });
    expect(res.citations).toEqual(["A-01", "A-99"]);
    expect(res.warnings.some((w) => w.kind === "unknown-evidence" && w.detail.includes("A-99"))).toBe(true);
  });

  it("does not warn about references to the opponent's existing evidence IDs", () => {
    const res = checkSpeech({
      text: "相手の証拠 [N-01] は古い。私たちの [A-01] が正しい。",
      side: "affirmative",
      kind: "rebuttal",
      part,
      lang: "ja",
      ownEvidence: evidence,
      opponentEvidence: [{ id: "N-01", claim: "c", quote: "q", source: { title: "t" } }],
    });
    expect(res.warnings.filter((w) => w.kind === "unknown-evidence")).toHaveLength(0);
  });

  it("warns about an ID that exists on neither side", () => {
    const res = checkSpeech({
      text: "新データ [N-99] によれば。",
      side: "negative",
      kind: "rebuttal",
      part,
      lang: "ja",
      ownEvidence: [{ id: "N-01", claim: "c", quote: "q", source: { title: "t" } }],
      opponentEvidence: evidence,
    });
    expect(res.warnings.some((w) => w.kind === "unknown-evidence" && w.detail.includes("N-99"))).toBe(true);
  });

  it("warns when a constructive has zero citations", () => {
    const res = checkSpeech({
      text: "根拠のない主張。",
      side: "affirmative",
      kind: "constructive",
      part,
      lang: "ja",
      ownEvidence: evidence,
    });
    expect(res.warnings.some((w) => w.kind === "no-citation")).toBe(true);
  });

  it("does not warn about zero citations during cross-examination", () => {
    const res = checkSpeech({
      text: "その根拠は何ですか。",
      side: "negative",
      kind: "question",
      part: getFormat("koshien-high").parts[1],
      lang: "ja",
      ownEvidence: [],
    });
    expect(res.warnings).toHaveLength(0);
  });

  it("warns about web-tool usage", () => {
    const res = checkSpeech({
      text: "主張 [A-01]。",
      side: "affirmative",
      kind: "rebuttal",
      part,
      lang: "ja",
      ownEvidence: evidence,
      webToolsUsed: ["WebSearch"],
    });
    expect(res.warnings.some((w) => w.kind === "web-tool-used")).toBe(true);
  });

  it("produces English warning text when lang is en", () => {
    const res = checkSpeech({
      text: "Claim [A-99].",
      side: "affirmative",
      kind: "constructive",
      part,
      lang: "en",
      ownEvidence: evidence,
    });
    expect(res.warnings.some((w) => w.kind === "unknown-evidence" && /not in the sealed material/.test(w.detail))).toBe(true);
  });
});

describe("detectWebToolUsage", () => {
  it("detects web tool names", () => {
    expect(detectWebToolUsage([{ name: "WebSearch", count: 2 }, { name: "Bash", count: 1 }])).toEqual(["WebSearch"]);
    expect(detectWebToolUsage([{ name: "web_search", count: 1 }])).toEqual(["web_search"]);
    expect(detectWebToolUsage([{ name: "Read", count: 3 }])).toEqual([]);
  });
});

describe("parseEvidence", () => {
  it("accepts a valid evidence.json", () => {
    const json = JSON.stringify([
      { id: "N-01", claim: "c", quote: "q", source: { title: "t", url: "https://x" } },
    ]);
    const res = parseEvidence(json, "negative", "ja");
    expect(res.errors).toEqual([]);
    expect(res.evidence).toHaveLength(1);
  });

  it("reports IDs that do not match the side and missing fields", () => {
    const json = JSON.stringify([{ id: "A-01", claim: "", quote: "q", source: {} }]);
    const res = parseEvidence(json, "negative", "ja");
    expect(res.errors.some((e) => e.includes("N-01」形式"))).toBe(true);
    expect(res.errors.some((e) => e.includes("claim"))).toBe(true);
    expect(res.errors.some((e) => e.includes("source.title"))).toBe(true);
  });

  it("reports broken JSON", () => {
    expect(parseEvidence("{oops", "affirmative", "ja").errors[0]).toContain("JSON として不正");
  });
});

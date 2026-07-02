import { describe, expect, it } from "vitest";
import { extractCitations, getFormat, type EvidenceEntry } from "@debate/shared";
import { checkSpeech, detectWebToolUsage, parseEvidence } from "../src/checks.js";

const part = getFormat("koshien-high").parts[0]; // 1AC constructive maxChars 2400

const evidence: EvidenceEntry[] = [
  { id: "A-01", claim: "c", quote: "q", source: { title: "t" } },
  { id: "A-02", claim: "c", quote: "q", source: { title: "t" } },
];

describe("extractCitations", () => {
  it("マーカーを出現順・重複なしで抽出する", () => {
    expect(extractCitations("本文 [A-01] と [A-02]、再び [A-01]。")).toEqual(["A-01", "A-02"]);
  });
  it("不正な形式は拾わない", () => {
    expect(extractCitations("[A-1] [B-01] [A-001]")).toEqual([]);
  });
});

describe("checkSpeech", () => {
  it("存在しない証拠 ID を警告する", () => {
    const res = checkSpeech({
      text: "主張 [A-01] と [A-99]。",
      side: "affirmative",
      kind: "constructive",
      part,
      ownEvidence: evidence,
    });
    expect(res.citations).toEqual(["A-01", "A-99"]);
    expect(res.warnings.some((w) => w.kind === "unknown-evidence" && w.detail.includes("A-99"))).toBe(true);
  });

  it("相手チームの実在する証拠 ID への言及は警告しない", () => {
    const res = checkSpeech({
      text: "相手の証拠 [N-01] は古い。私たちの [A-01] が正しい。",
      side: "affirmative",
      kind: "rebuttal",
      part,
      ownEvidence: evidence,
      opponentEvidence: [{ id: "N-01", claim: "c", quote: "q", source: { title: "t" } }],
    });
    expect(res.warnings.filter((w) => w.kind === "unknown-evidence")).toHaveLength(0);
  });

  it("相手側にも存在しない ID は警告する", () => {
    const res = checkSpeech({
      text: "新データ [N-99] によれば。",
      side: "negative",
      kind: "rebuttal",
      part,
      ownEvidence: [{ id: "N-01", claim: "c", quote: "q", source: { title: "t" } }],
      opponentEvidence: evidence,
    });
    expect(res.warnings.some((w) => w.kind === "unknown-evidence" && w.detail.includes("N-99"))).toBe(true);
  });

  it("立論で証拠参照ゼロなら警告する", () => {
    const res = checkSpeech({
      text: "根拠のない主張。",
      side: "affirmative",
      kind: "constructive",
      part,
      ownEvidence: evidence,
    });
    expect(res.warnings.some((w) => w.kind === "no-citation")).toBe(true);
  });

  it("質疑では証拠参照ゼロでも警告しない", () => {
    const res = checkSpeech({
      text: "その根拠は何ですか。",
      side: "negative",
      kind: "question",
      part: getFormat("koshien-high").parts[1],
      ownEvidence: [],
    });
    expect(res.warnings).toHaveLength(0);
  });

  it("Web ツール使用を警告する", () => {
    const res = checkSpeech({
      text: "主張 [A-01]。",
      side: "affirmative",
      kind: "rebuttal",
      part,
      ownEvidence: evidence,
      webToolsUsed: ["WebSearch"],
    });
    expect(res.warnings.some((w) => w.kind === "web-tool-used")).toBe(true);
  });
});

describe("detectWebToolUsage", () => {
  it("Web 系ツール名を検出する", () => {
    expect(detectWebToolUsage([{ name: "WebSearch", count: 2 }, { name: "Bash", count: 1 }])).toEqual(["WebSearch"]);
    expect(detectWebToolUsage([{ name: "web_search", count: 1 }])).toEqual(["web_search"]);
    expect(detectWebToolUsage([{ name: "Read", count: 3 }])).toEqual([]);
  });
});

describe("parseEvidence", () => {
  it("正しい evidence.json を受理する", () => {
    const json = JSON.stringify([
      { id: "N-01", claim: "c", quote: "q", source: { title: "t", url: "https://x" } },
    ]);
    const res = parseEvidence(json, "negative");
    expect(res.errors).toEqual([]);
    expect(res.evidence).toHaveLength(1);
  });

  it("立場と合わない ID・欠落フィールドを報告する", () => {
    const json = JSON.stringify([{ id: "A-01", claim: "", quote: "q", source: {} }]);
    const res = parseEvidence(json, "negative");
    expect(res.errors.some((e) => e.includes("N-01」形式"))).toBe(true);
    expect(res.errors.some((e) => e.includes("claim"))).toBe(true);
    expect(res.errors.some((e) => e.includes("source.title"))).toBe(true);
  });

  it("壊れた JSON を報告する", () => {
    expect(parseEvidence("{oops", "affirmative").errors[0]).toContain("JSON として不正");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildManifest, rootHashOf, sealDirectory, verifySeal } from "../src/hash.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "debate-hash-"));
  fs.writeFileSync(path.join(dir, "handout.md"), "# handout\n本文", "utf8");
  fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify([{ id: "A-01" }]), "utf8");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("seal / verify", () => {
  it("同じ内容なら検証に通る", () => {
    const seal = sealDirectory(dir, "A");
    expect(seal.files).toHaveLength(2);
    expect(seal.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySeal(dir, seal).ok).toBe(true);
  });

  it("ファイル変更を検出する", () => {
    const seal = sealDirectory(dir, "A");
    fs.writeFileSync(path.join(dir, "handout.md"), "改ざん", "utf8");
    const res = verifySeal(dir, seal);
    expect(res.ok).toBe(false);
    expect(res.detail).toContain("handout.md");
  });

  it("ファイル追加・削除を検出する", () => {
    const seal = sealDirectory(dir, "A");
    fs.writeFileSync(path.join(dir, "extra.txt"), "x", "utf8");
    expect(verifySeal(dir, seal).detail).toContain("追加: extra.txt");
    fs.rmSync(path.join(dir, "extra.txt"));
    fs.rmSync(path.join(dir, "evidence.json"));
    expect(verifySeal(dir, seal).detail).toContain("削除: evidence.json");
  });

  it("ルートハッシュはファイル順に依存しない", () => {
    const manifest = buildManifest(dir);
    const reversed = [...manifest].reverse();
    expect(rootHashOf(manifest)).toBe(rootHashOf(reversed));
  });
});

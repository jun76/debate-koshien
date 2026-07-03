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
  it("passes verification when the content is unchanged", () => {
    const seal = sealDirectory(dir, "A");
    expect(seal.files).toHaveLength(2);
    expect(seal.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySeal(dir, seal).ok).toBe(true);
  });

  it("detects a modified file", () => {
    const seal = sealDirectory(dir, "A");
    fs.writeFileSync(path.join(dir, "handout.md"), "改ざん", "utf8");
    const res = verifySeal(dir, seal);
    expect(res.ok).toBe(false);
    expect(res.diffs).toContainEqual({ kind: "changed", path: "handout.md" });
  });

  it("detects added and removed files", () => {
    const seal = sealDirectory(dir, "A");
    fs.writeFileSync(path.join(dir, "extra.txt"), "x", "utf8");
    expect(verifySeal(dir, seal).diffs).toContainEqual({ kind: "added", path: "extra.txt" });
    fs.rmSync(path.join(dir, "extra.txt"));
    fs.rmSync(path.join(dir, "evidence.json"));
    expect(verifySeal(dir, seal).diffs).toContainEqual({ kind: "removed", path: "evidence.json" });
  });

  it("root hash does not depend on file order", () => {
    const manifest = buildManifest(dir);
    const reversed = [...manifest].reverse();
    expect(rootHashOf(manifest)).toBe(rootHashOf(reversed));
  });
});

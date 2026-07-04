import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Seal, SealManifestFile, TeamKey } from "@debate-koshien/shared";

/** A single difference detected against a seal manifest. The caller localizes it for display. */
export interface SealDiff {
  kind: "added" | "changed" | "removed";
  path: string;
}

export interface VerifyResult {
  ok: boolean;
  /** Per-file differences (empty when ok, or when only the root hash differs). */
  diffs: SealDiff[];
}

export function sha256Bytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** List every file under a directory (relative paths, "/"-separated, sorted). */
export function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    const abs = path.join(dir, rel);
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(childRel);
      else out.push(childRel);
    }
  };
  walk("");
  return out.sort();
}

/** Build a manifest of per-file hashes. */
export function buildManifest(dir: string): SealManifestFile[] {
  return listFiles(dir).map((rel) => {
    const buf = fs.readFileSync(path.join(dir, rel));
    return { path: rel, sha256: sha256Bytes(buf), bytes: buf.length };
  });
}

/**
 * Compute the root hash from a manifest.
 * SHA-256 of the "path\nsha256\n" lines concatenated in path order (normalized, so
 * environment-independent).
 */
export function rootHashOf(files: SealManifestFile[]): string {
  const canonical = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((f) => `${f.path}\n${f.sha256}\n`)
    .join("");
  return sha256Bytes(canonical);
}

export function sealDirectory(dir: string, team: TeamKey): Seal {
  const files = buildManifest(dir);
  return { team, files, rootHash: rootHashOf(files), sealedAt: new Date().toISOString() };
}

/** Compare the manifest captured at seal time against the current directory contents. */
export function verifySeal(dir: string, seal: Seal): VerifyResult {
  const current = buildManifest(dir);
  const currentRoot = rootHashOf(current);
  if (currentRoot === seal.rootHash) return { ok: true, diffs: [] };
  const before = new Map(seal.files.map((f) => [f.path, f.sha256]));
  const after = new Map(current.map((f) => [f.path, f.sha256]));
  const diffs: SealDiff[] = [];
  for (const [p, h] of after) {
    if (!before.has(p)) diffs.push({ kind: "added", path: p });
    else if (before.get(p) !== h) diffs.push({ kind: "changed", path: p });
  }
  for (const p of before.keys()) {
    if (!after.has(p)) diffs.push({ kind: "removed", path: p });
  }
  return { ok: false, diffs };
}

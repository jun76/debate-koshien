import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Seal, SealManifestFile, TeamKey } from "@debate/shared";

export function sha256Bytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** ディレクトリ配下の全ファイルを列挙（相対パス、/ 区切り、ソート済み） */
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

/** ファイル別ハッシュのマニフェストを作る */
export function buildManifest(dir: string): SealManifestFile[] {
  return listFiles(dir).map((rel) => {
    const buf = fs.readFileSync(path.join(dir, rel));
    return { path: rel, sha256: sha256Bytes(buf), bytes: buf.length };
  });
}

/**
 * マニフェストからルートハッシュを計算する。
 * 「path\nsha256\n」をパス順に連結した文字列の SHA-256（正規化済みなので環境非依存）。
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

/** 封印時のマニフェストと現在のディレクトリ内容を比較する */
export function verifySeal(dir: string, seal: Seal): { ok: boolean; detail?: string } {
  const current = buildManifest(dir);
  const currentRoot = rootHashOf(current);
  if (currentRoot === seal.rootHash) return { ok: true };
  const before = new Map(seal.files.map((f) => [f.path, f.sha256]));
  const after = new Map(current.map((f) => [f.path, f.sha256]));
  const changed: string[] = [];
  for (const [p, h] of after) {
    if (!before.has(p)) changed.push(`追加: ${p}`);
    else if (before.get(p) !== h) changed.push(`変更: ${p}`);
  }
  for (const p of before.keys()) {
    if (!after.has(p)) changed.push(`削除: ${p}`);
  }
  return { ok: false, detail: changed.join(", ") || "ルートハッシュ不一致" };
}

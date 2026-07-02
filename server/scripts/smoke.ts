/**
 * 実 CLI アダプタのスモークテスト。
 *   pnpm --filter @debate/server exec tsx scripts/smoke.ts claude codex opencode
 * 各プロバイダに簡単な指示を投げ、出力とツール使用履歴を表示する。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Provider } from "@debate/shared";
import { getAdapter } from "../src/adapters/index.js";

const providers = (process.argv.slice(2).length ? process.argv.slice(2) : ["claude", "codex", "opencode"]) as Provider[];

const results: Record<string, unknown> = {};

for (const provider of providers) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), `debate-smoke-${provider}-`));
  process.stdout.write(`\n=== ${provider} ===\n`);
  const started = Date.now();
  try {
    const adapter = getAdapter(provider);
    const res = await adapter.invoke({
      kind: "speech",
      agent: { id: "smoke", name: `smoke-${provider}`, provider },
      matchId: "smoke",
      label: `smoke-${provider}`,
      instructions:
        "これは接続テストです。ツールは使わず、「接続OK」という4文字だけを出力してください。他の文字は一切出力しないでください。",
      workspaceDir: workspace,
      allowWeb: false,
      needsFileTools: false,
      timeoutMs: 180_000,
    });
    results[provider] = { ok: true, output: res.output.slice(0, 200), toolUsage: res.toolUsage, ms: Date.now() - started };
    console.log(`OK (${Date.now() - started}ms): ${JSON.stringify(res.output.slice(0, 200))}`);
    if (res.toolUsage.length) console.log(`toolUsage: ${JSON.stringify(res.toolUsage)}`);
  } catch (err) {
    results[provider] = { ok: false, error: String(err), ms: Date.now() - started };
    console.log(`FAILED (${Date.now() - started}ms): ${String(err)}`);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

console.log(`\n--- summary ---\n${JSON.stringify(results, null, 2)}`);

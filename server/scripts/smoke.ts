/**
 * Smoke test for the real CLI adapters.
 *   pnpm --filter @debate-koshien/server exec tsx scripts/smoke.ts claude codex opencode
 * Sends a simple instruction to each provider and prints the output and tool-usage history.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Provider } from "@debate-koshien/shared";
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
        'This is a connectivity test. Do not use any tools; output only the two words "connection ok" and nothing else.',
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

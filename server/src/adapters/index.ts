import type { Provider } from "@debate-koshien/shared";
import { saveAgentLog } from "../store.js";
import { ClaudeAdapter } from "./claude.js";
import { CodexAdapter } from "./codex.js";
import { MockAdapter } from "./mock.js";
import { OpenCodeAdapter } from "./opencode.js";
import type { AgentAdapter, AgentInvocation, AgentResult } from "./types.js";

const adapters: Record<Provider, AgentAdapter> = {
  mock: new MockAdapter(),
  claude: new ClaudeAdapter(),
  codex: new CodexAdapter(),
  opencode: new OpenCodeAdapter(),
};

const serializedProviders = new Set<Provider>(["opencode"]);
const providerQueues = new Map<Provider, Promise<void>>();

async function withProviderQueue<T>(provider: Provider, run: () => Promise<T>): Promise<T> {
  if (!serializedProviders.has(provider)) return run();

  const previous = providerQueues.get(provider) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  providerQueues.set(provider, tail);

  await previous.catch(() => undefined);
  try {
    return await run();
  } finally {
    release();
    if (providerQueues.get(provider) === tail) providerQueues.delete(provider);
  }
}

export function getAdapter(provider: Provider): AgentAdapter {
  const a = adapters[provider];
  if (!a) throw new Error(`unknown provider: ${provider}`);
  return a;
}

/** Invoke the adapter and always persist the raw log. */
export async function invokeAgent(inv: AgentInvocation): Promise<AgentResult> {
  const adapter = getAdapter(inv.agent.provider);
  try {
    const result = await withProviderQueue(inv.agent.provider, () => adapter.invoke(inv));
    saveAgentLog(inv.matchId, `${inv.label}-${inv.kind}`, {
      agent: inv.agent,
      kind: inv.kind,
      allowWeb: inv.allowWeb,
      durationMs: result.durationMs,
      toolUsage: result.toolUsage,
      output: result.output,
      raw: result.raw,
    });
    return result;
  } catch (err) {
    saveAgentLog(inv.matchId, `${inv.label}-${inv.kind}-error`, {
      agent: inv.agent,
      kind: inv.kind,
      error: String(err),
    });
    throw err;
  }
}

export * from "./types.js";

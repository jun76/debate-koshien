import { execCommand } from "../exec.js";
import { addToolUsage, toolUsageFromMap, type AgentAdapter, type AgentInvocation, type AgentResult } from "./types.js";

/**
 * Run Claude Code in non-interactive mode (claude -p).
 * - Read the output as stream-json and collect the tool-usage history as an audit log.
 * - Web is forbidden via --disallowedTools WebSearch,WebFetch.
 * - For text-only tasks, disable all tools to speed things up.
 */
export class ClaudeAdapter implements AgentAdapter {
  readonly provider = "claude";

  async invoke(inv: AgentInvocation): Promise<AgentResult> {
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--dangerously-skip-permissions",
    ];
    if (inv.agent.model) args.push("--model", inv.agent.model);
    if (inv.agent.reasoningEffort) args.push("--effort", inv.agent.reasoningEffort);

    if (!inv.needsFileTools) {
      // Speech generation / judging are text-only. Disable tools to reduce drift and latency.
      args.push("--tools", "");
    } else if (!inv.allowWeb) {
      args.push("--disallowedTools", "WebSearch,WebFetch");
    }
    if (inv.needsFileTools && inv.allowWeb) {
      // Preparation phase: allow web research and file creation (the default tool set).
    }

    const res = await execCommand("claude", args, {
      cwd: inv.workspaceDir,
      stdin: inv.instructions,
      timeoutMs: inv.timeoutMs,
    });

    const usage = new Map<string, number>();
    let resultText = "";
    const assistantTexts: string[] = [];
    let cliError = "";
    let rateLimitSeen = false;
    for (const line of res.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const ev = JSON.parse(trimmed) as Record<string, unknown>;
        if (ev.type === "rate_limit_event") {
          // This notification also fires on success, so just record it; only treat it as an
          // error if no result was produced.
          rateLimitSeen = true;
        }
        if (ev.type === "assistant") {
          const msg = ev.message as { content?: { type: string; name?: string; text?: string }[] } | undefined;
          for (const block of msg?.content ?? []) {
            if (block.type === "tool_use" && block.name) addToolUsage(usage, block.name);
            if (block.type === "text" && block.text) assistantTexts.push(block.text);
          }
        }
        if (ev.type === "result" && typeof ev.result === "string") {
          resultText = ev.result;
          if (ev.is_error === true) {
            cliError = `API error${typeof ev.api_error_status === "number" ? ` ${ev.api_error_status}` : ""}`;
          }
        }
      } catch {
        // Ignore non-JSON lines.
      }
    }

    if (!resultText) resultText = assistantTexts.at(-1) ?? res.stdout.trim();
    if (res.timedOut) throw new Error(`claude timed out (${inv.timeoutMs}ms)`);
    if (!resultText && rateLimitSeen) cliError = "rate limit";
    if (res.code !== 0 || cliError) {
      const detail = (cliError || resultText || res.stderr).slice(0, 500);
      throw new Error(`claude failed (exit ${res.code ?? "unknown"}): ${detail}`);
    }

    return {
      output: resultText.trim(),
      toolUsage: toolUsageFromMap(usage),
      raw: { args, exitCode: res.code, stderr: res.stderr.slice(0, 2000), stdout: res.stdout.slice(-20000) },
      durationMs: res.durationMs,
    };
  }
}

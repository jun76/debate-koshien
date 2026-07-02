import { execCommand } from "../exec.js";
import { addToolUsage, toolUsageFromMap, type AgentAdapter, type AgentInvocation, type AgentResult } from "./types.js";

/**
 * Claude Code の非対話モード（claude -p）で実行する。
 * - 出力は stream-json で受けて、ツール使用履歴を監査ログとして回収する
 * - Web 禁止は --disallowedTools WebSearch,WebFetch で強制する
 * - テキストのみのタスクではツールを全て無効化して高速化する
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
      // 発言生成・審査はテキストのみ。ツールを無効化して逸脱と待ち時間を減らす
      args.push("--tools", "");
    } else if (!inv.allowWeb) {
      args.push("--disallowedTools", "WebSearch,WebFetch");
    }
    if (inv.needsFileTools && inv.allowWeb) {
      // 準備フェーズ: Web 調査とファイル作成を許可（既定のツールセット）
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
          // 通知イベントは成功時にも流れるため記録だけする。結果が得られなかった場合のみエラー扱い
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
        // JSON でない行は無視
      }
    }

    if (!resultText) resultText = assistantTexts.at(-1) ?? res.stdout.trim();
    if (res.timedOut) throw new Error(`claude がタイムアウトした (${inv.timeoutMs}ms)`);
    if (!resultText && rateLimitSeen) cliError = "rate limit";
    if (res.code !== 0 || cliError) {
      const detail = (cliError || resultText || res.stderr).slice(0, 500);
      throw new Error(`claude が失敗した (exit ${res.code ?? "unknown"}): ${detail}`);
    }

    return {
      output: resultText.trim(),
      toolUsage: toolUsageFromMap(usage),
      raw: { args, exitCode: res.code, stderr: res.stderr.slice(0, 2000), stdout: res.stdout.slice(-20000) },
      durationMs: res.durationMs,
    };
  }
}

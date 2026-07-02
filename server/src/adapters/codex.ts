import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execCommand } from "../exec.js";
import { addToolUsage, toolUsageFromMap, type AgentAdapter, type AgentInvocation, type AgentResult } from "./types.js";

function codexEntry(): string {
  const appdata = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const js = path.join(appdata, "npm", "node_modules", "@openai", "codex", "bin", "codex.js");
  if (fs.existsSync(js)) return js;
  throw new Error(`codex CLI が見つからない: ${js}`);
}

/**
 * Codex CLI（codex exec）で実行する。
 * - サンドボックスは workspace-write。ネットワークは sandbox_workspace_write.network_access で制御する
 * - 準備フェーズのみ web_search ツールを有効化する
 * - 最終メッセージは --output-last-message で回収する
 */
export class CodexAdapter implements AgentAdapter {
  readonly provider = "codex";

  async invoke(inv: AgentInvocation): Promise<AgentResult> {
    const lastMsgFile = path.join(inv.workspaceDir, `.codex-last-${Date.now()}.txt`);
    const args = [
      codexEntry(),
      "exec",
      "--skip-git-repo-check",
      "-C",
      inv.workspaceDir,
      "--sandbox",
      "workspace-write",
      "-c",
      `sandbox_workspace_write.network_access=${inv.allowWeb ? "true" : "false"}`,
      // ユーザー設定（config.toml）は読み込まない。MCP サーバが headless 実行で
      // 認証待ち・接続失敗になり試合が止まるため。認証情報は CODEX_HOME から使われる。
      // モデルや推論モードは試合設定から明示的に渡す
      "--ignore-user-config",
      "--json",
      "--output-last-message",
      lastMsgFile,
    ];
    if (inv.allowWeb) args.push("-c", "tools.web_search=true");
    if (inv.agent.model) args.push("-m", inv.agent.model);
    if (inv.agent.reasoningEffort) args.push("-c", `model_reasoning_effort="${inv.agent.reasoningEffort}"`);
    args.push("-"); // プロンプトは stdin から

    const res = await execCommand(process.execPath, args, {
      cwd: inv.workspaceDir,
      stdin: inv.instructions,
      timeoutMs: inv.timeoutMs,
    });

    const usage = new Map<string, number>();
    const agentTexts: string[] = [];
    const errorMessages: string[] = [];
    for (const line of res.stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const ev = JSON.parse(trimmed) as Record<string, unknown>;
        const item = (ev.item ?? ev.msg ?? ev) as Record<string, unknown>;
        const itemType = String(item.type ?? ev.type ?? "");
        if (itemType.includes("web_search")) addToolUsage(usage, "web_search");
        if (itemType.includes("command_execution") || itemType.includes("exec_command")) {
          addToolUsage(usage, "shell");
        }
        if (itemType === "agent_message" && typeof item.text === "string") agentTexts.push(item.text);
        if (ev.type === "error" && typeof ev.message === "string") errorMessages.push(ev.message);
        const turnError = (ev.error ?? {}) as Record<string, unknown>;
        if (ev.type === "turn.failed" && typeof turnError.message === "string") {
          errorMessages.push(turnError.message);
        }
      } catch {
        // JSON でない行は無視
      }
    }

    let output = "";
    try {
      output = fs.readFileSync(lastMsgFile, "utf8").trim();
    } catch {
      output = agentTexts.at(-1)?.trim() ?? "";
    } finally {
      fs.rmSync(lastMsgFile, { force: true });
    }

    if (res.timedOut) throw new Error(`codex がタイムアウトした (${inv.timeoutMs}ms)`);
    if (res.code !== 0) {
      const detail = ([...new Set(errorMessages)].join(" / ") || res.stderr || output).slice(0, 500);
      throw new Error(`codex が失敗した (exit ${res.code}): ${detail}`);
    }

    return {
      output,
      toolUsage: toolUsageFromMap(usage),
      raw: { exitCode: res.code, stderr: res.stderr.slice(0, 2000), stdout: res.stdout.slice(-20000) },
      durationMs: res.durationMs,
    };
  }
}

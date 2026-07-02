import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execCommand, stripAnsi } from "../exec.js";
import type { AgentAdapter, AgentInvocation, AgentResult } from "./types.js";

function opencodeExe(): string {
  const appdata = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  const exe = path.join(appdata, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
  if (fs.existsSync(exe)) return exe;
  throw new Error(`opencode CLI が見つからない: ${exe}`);
}

/**
 * OpenCode CLI（opencode run）で実行する。
 * - Web 禁止はワークスペースに書き込む opencode.json の permission 設定で強制する
 * - 長い指示は INSTRUCTIONS.md に書き、メッセージにはファイル添付で渡す
 *   （argv 上限と引用問題を避けるため）
 */
export class OpenCodeAdapter implements AgentAdapter {
  readonly provider = "opencode";

  async invoke(inv: AgentInvocation): Promise<AgentResult> {
    // 権限設定をワークスペースに配置（プロンプトではなく実行権限としての Web 禁止）
    const permissionConfig = {
      $schema: "https://opencode.ai/config.json",
      permission: {
        edit: "allow",
        bash: "allow",
        webfetch: inv.allowWeb ? "allow" : "deny",
      },
    };
    fs.writeFileSync(path.join(inv.workspaceDir, "opencode.json"), JSON.stringify(permissionConfig, null, 2), "utf8");

    const instructionsFile = path.join(inv.workspaceDir, "INSTRUCTIONS.md");
    fs.writeFileSync(instructionsFile, inv.instructions, "utf8");

    const args = [
      "run",
      "添付した INSTRUCTIONS.md の指示に従って、指定された最終出力だけを返してください。",
      "--format",
      "json",
      `--file=${instructionsFile}`,
      "--dir",
      inv.workspaceDir,
    ];
    if (inv.agent.model) args.push("-m", inv.agent.model);
    if (inv.agent.reasoningEffort) args.push("--variant", inv.agent.reasoningEffort);

    const res = await execCommand(opencodeExe(), args, {
      cwd: inv.workspaceDir,
      timeoutMs: inv.timeoutMs,
    });

    if (res.timedOut) throw new Error(`opencode がタイムアウトした (${inv.timeoutMs}ms)`);
    const jsonTexts: string[] = [];
    for (const line of stripAnsi(res.stdout).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const ev = JSON.parse(trimmed) as { part?: { text?: unknown }; text?: unknown; type?: unknown };
        const text = typeof ev.part?.text === "string" ? ev.part.text : typeof ev.text === "string" ? ev.text : "";
        if (text) jsonTexts.push(text);
      } catch {
        // JSON でない行は無視
      }
    }
    const output = jsonTexts.join("").trim() || stripAnsi(res.stdout).trim();
    if (res.code !== 0) {
      throw new Error(`opencode が失敗した (exit ${res.code}): ${(stripAnsi(res.stderr) || output).slice(0, 500)}`);
    }

    return {
      output,
      // opencode はツール使用履歴を機械可読で返さないため、権限設定（webfetch deny）で担保する
      toolUsage: [],
      raw: { exitCode: res.code, stderr: stripAnsi(res.stderr).slice(0, 2000) },
      durationMs: res.durationMs,
    };
  }
}

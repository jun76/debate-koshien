import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execCommand, stripAnsi } from "../exec.js";
import type { AgentAdapter, AgentInvocation, AgentResult } from "./types.js";

function resolveOnPath(command: string): string | null {
  const pathValue = process.env.PATH;
  if (!pathValue) return null;
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir, command);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function opencodeExe(): string {
  if (process.env.OPENCODE_PATH && fs.existsSync(process.env.OPENCODE_PATH)) {
    return process.env.OPENCODE_PATH;
  }

  if (process.platform !== "win32") {
    const pathCommand = resolveOnPath("opencode");
    if (pathCommand) return pathCommand;
    throw new Error("opencode CLI not found on PATH");
  }

  const username = os.userInfo().username;
  const systemDrive = process.env.SystemDrive ?? "C:";

  const candidates = [
    process.env.APPDATA,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, "AppData", "Roaming") : undefined,
    process.env.HOMEDRIVE && process.env.HOMEPATH
      ? path.join(`${process.env.HOMEDRIVE}${process.env.HOMEPATH}`, "AppData", "Roaming")
      : undefined,
    path.join(systemDrive, "Users", username, "AppData", "Roaming"),
    path.join(os.homedir(), "AppData", "Roaming"),
  ].filter((value): value is string => Boolean(value));

  for (const appdata of candidates) {
    const exe = path.join(appdata, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe");
    if (fs.existsSync(exe)) return exe;
  }

  const windowsPathCommand = resolveOnPath("opencode.exe");
  if (windowsPathCommand) return windowsPathCommand;

  throw new Error(`opencode CLI not found: ${candidates.join(" | ")}`);
}

/**
 * Run the OpenCode CLI (opencode run).
 * - Web is forbidden via the permission config in the opencode.json written to the workspace.
 * - Long instructions are written to INSTRUCTIONS.md and passed to the message as a file
 *   attachment (to avoid argv length limits and quoting issues).
 */
export class OpenCodeAdapter implements AgentAdapter {
  readonly provider = "opencode";

  async invoke(inv: AgentInvocation): Promise<AgentResult> {
    // Place the permission config in the workspace (web forbidden as an execution permission,
    // not via the prompt).
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
    const outputFile = path.join(inv.workspaceDir, "OUTPUT.md");
    fs.rmSync(outputFile, { force: true });

    const args = [
      "run",
      "Follow the instructions in the attached INSTRUCTIONS.md and return only the specified final output.",
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

    if (res.timedOut) throw new Error(`opencode timed out (${inv.timeoutMs}ms)`);
    const jsonTexts: string[] = [];
    for (const line of stripAnsi(res.stdout).split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        const ev = JSON.parse(trimmed) as { part?: { text?: unknown }; text?: unknown; type?: unknown };
        const text = typeof ev.part?.text === "string" ? ev.part.text : typeof ev.text === "string" ? ev.text : "";
        if (text) jsonTexts.push(text);
      } catch {
        // Ignore non-JSON lines.
      }
    }
    const output = jsonTexts.join("").trim() || stripAnsi(res.stdout).trim();
    if (res.code !== 0) {
      throw new Error(`opencode failed (exit ${res.code}): ${(stripAnsi(res.stderr) || output).slice(0, 500)}`);
    }

    const fileOutput = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8").trim() : "";
    const finalOutput = fileOutput || output;

    return {
      output: finalOutput,
      // opencode does not return a machine-readable tool-usage history, so the permission config
      // (webfetch deny) is what enforces the web ban.
      toolUsage: [],
      raw: { exitCode: res.code, stderr: stripAnsi(res.stderr).slice(0, 2000) },
      durationMs: res.durationMs,
    };
  }
}

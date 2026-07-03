import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Run a subprocess and collect its output. No shell is involved (to avoid argument-quoting issues).
 * On timeout, kill the whole process tree via taskkill.
 */
export function execCommand(
  file: string,
  args: string[],
  opts: { cwd?: string; stdin?: string; timeoutMs: number; env?: NodeJS.ProcessEnv },
): Promise<ExecResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } else {
        child.kill("SIGKILL");
      }
    }, opts.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (stdout += d));
    child.stderr.on("data", (d: string) => (stderr += d));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, durationMs: Date.now() - started });
    });

    if (opts.stdin !== undefined) {
      child.stdin.write(opts.stdin, "utf8");
    }
    child.stdin.end();
  });
}

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const CSI_RE = new RegExp(ESC + "\\[[0-9;?]*[a-zA-Z]", "g");
const OSC_RE = new RegExp(ESC + "\\][^" + BEL + "]*(" + BEL + "|" + ESC + "\\\\)", "g");

/** Strip ANSI escape sequences (CSI / OSC). */
export function stripAnsi(text: string): string {
  return text.replace(CSI_RE, "").replace(OSC_RE, "");
}

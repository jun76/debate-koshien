import fs from "node:fs";
import path from "node:path";
import { execCommand } from "./exec.js";
import { TTS_DIR } from "./paths.js";

/**
 * piper-plus による音声合成。
 * assets/tts/piper/piper.exe とつくよみちゃんモデルを scripts/setup-tts.ps1 で整備する前提。
 * 未整備ならアプリは音声なしで動作する（縮退）。
 */

const PIPER_EXE = path.join(TTS_DIR, "piper", "piper.exe");
const MODEL_DIR = path.join(TTS_DIR, "models");
const OPENJTALK_DIC = path.join(TTS_DIR, "piper", "share", "open_jtalk", "dic");

interface TtsPaths {
  exe: string;
  model: string;
  config?: string;
}

let cached: TtsPaths | null | undefined;

export function resolveTts(): TtsPaths | null {
  if (cached !== undefined) return cached;
  if (!fs.existsSync(PIPER_EXE)) {
    cached = null;
    return cached;
  }
  const onnx = fs.existsSync(MODEL_DIR)
    ? fs.readdirSync(MODEL_DIR).find((f) => f.endsWith(".onnx"))
    : undefined;
  if (!onnx) {
    cached = null;
    return cached;
  }
  const model = path.join(MODEL_DIR, onnx);
  const configCandidates = [
    `${model}.json`,
    path.join(MODEL_DIR, `${path.basename(model, ".onnx")}.json`),
    path.join(MODEL_DIR, "config.json"),
  ];
  const config = configCandidates.find((f) => fs.existsSync(f));
  cached = {
    exe: PIPER_EXE,
    model,
    config,
  };
  return cached;
}

export function ttsAvailable(): boolean {
  return resolveTts() !== null;
}

/** WAV ヘッダから再生時間（ms）を求める */
export function wavDurationMs(file: string): number {
  const buf = fs.readFileSync(file);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return 0;
  const byteRate = buf.readUInt32LE(28);
  // data チャンクを探す
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      return byteRate > 0 ? Math.round((size / byteRate) * 1000) : 0;
    }
    offset += 8 + size + (size % 2);
  }
  return 0;
}

/** 読み上げ用にテキストを整形（証拠 ID マーカーなどを除去） */
export function speakableText(text: string): string {
  return text
    .replace(/\[[AN]-\d{2}\]/g, "")
    .replace(/[#*`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let queue: Promise<void> = Promise.resolve();

/** 合成はキューで直列実行する（CPU スパイク防止） */
export function enqueueSynthesis(text: string, wavPath: string): Promise<number | null> {
  const job = queue.then(() => synthesize(text, wavPath));
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

async function synthesize(text: string, wavPath: string): Promise<number | null> {
  const tts = resolveTts();
  if (!tts) return null;
  fs.mkdirSync(path.dirname(wavPath), { recursive: true });
  const speakable = speakableText(text);
  if (!speakable) return null;

  const args = ["--model", tts.model, "--text", speakable, "--output_file", wavPath];
  if (tts.config) args.push("--config", tts.config);

  // --text は Windows で UTF-16 argv として渡るため、日本語のコードページ問題を避けられる。
  const res = await execCommand(tts.exe, args, {
    cwd: path.dirname(tts.exe),
    env: {
      PIPER_MODEL_DIR: MODEL_DIR,
      OPENJTALK_DICTIONARY_PATH: OPENJTALK_DIC,
    },
    timeoutMs: 120_000,
  });
  if (res.code !== 0 || !fs.existsSync(wavPath)) {
    throw new Error(`piper 合成失敗 (exit ${res.code}): ${res.stderr.slice(0, 300)}`);
  }
  return wavDurationMs(wavPath);
}

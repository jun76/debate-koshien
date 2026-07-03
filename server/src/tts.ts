import fs from "node:fs";
import path from "node:path";
import type { Lang } from "@debate/shared";
import { execCommand } from "./exec.js";
import { TTS_DIR } from "./paths.js";

/**
 * Speech synthesis via piper-plus.
 * Assumes assets/tts/piper/piper.exe plus a per-language voice model are provisioned by
 * scripts/setup-tts.ps1. Models live under assets/tts/models/<lang>/ (*.onnx + config). If a
 * given language is not provisioned, the app runs without audio for that language (degraded).
 */

const PIPER_EXE = path.join(TTS_DIR, "piper", "piper.exe");
const MODELS_ROOT = path.join(TTS_DIR, "models");
const OPENJTALK_DIC = path.join(TTS_DIR, "piper", "share", "open_jtalk", "dic");
// piper-plus の言語別 G2P 辞書（英語の CMU 辞書など）。この配置（piper/ 直下に exe と share/ が
// 並ぶ）では exe 相対の探索（<exe>/../share/piper/dicts）が外れるため、環境変数で明示する。
// 未設定だと英語が音素化されず、ごく短いノイズ状の音声になる。
const PIPER_DICTS = path.join(TTS_DIR, "piper", "share", "piper", "dicts");

interface TtsPaths {
  exe: string;
  model: string;
  config?: string;
}

/**
 * Resolve the model directory for a language. Back-compat: a legacy flat layout
 * (assets/tts/models/*.onnx) is treated as the Japanese voice.
 */
function modelDirFor(lang: Lang): string {
  const langDir = path.join(MODELS_ROOT, lang);
  if (fs.existsSync(langDir)) return langDir;
  if (lang === "ja") return MODELS_ROOT;
  return langDir;
}

const cache = new Map<Lang, TtsPaths | null>();

export function resolveTts(lang: Lang): TtsPaths | null {
  const cached = cache.get(lang);
  if (cached !== undefined) return cached;

  let resolved: TtsPaths | null = null;
  const modelDir = modelDirFor(lang);
  if (fs.existsSync(PIPER_EXE) && fs.existsSync(modelDir)) {
    const onnx = fs.readdirSync(modelDir).find((f) => f.endsWith(".onnx"));
    if (onnx) {
      const model = path.join(modelDir, onnx);
      const configCandidates = [
        `${model}.json`,
        path.join(modelDir, `${path.basename(model, ".onnx")}.json`),
        path.join(modelDir, "config.json"),
      ];
      const config = configCandidates.find((f) => fs.existsSync(f));
      resolved = { exe: PIPER_EXE, model, config };
    }
  }
  cache.set(lang, resolved);
  return resolved;
}

export function ttsAvailable(lang: Lang): boolean {
  return resolveTts(lang) !== null;
}

/** Compute playback duration (ms) from the WAV header. */
export function wavDurationMs(file: string): number {
  const buf = fs.readFileSync(file);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return 0;
  const byteRate = buf.readUInt32LE(28);
  // Find the data chunk.
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

/** Normalize text for reading aloud (strip evidence-ID markers and Markdown symbols). */
export function speakableText(text: string): string {
  return text
    .replace(/\[[AN]-\d{2}\]/g, "")
    .replace(/[#*`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let queue: Promise<void> = Promise.resolve();

/** Synthesis runs serially through a queue (to avoid CPU spikes). */
export function enqueueSynthesis(text: string, wavPath: string, lang: Lang): Promise<number | null> {
  const job = queue.then(() => synthesize(text, wavPath, lang));
  queue = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

async function synthesize(text: string, wavPath: string, lang: Lang): Promise<number | null> {
  const tts = resolveTts(lang);
  if (!tts) return null;
  fs.mkdirSync(path.dirname(wavPath), { recursive: true });
  const speakable = speakableText(text);
  if (!speakable) return null;

  const args = ["--model", tts.model, "--text", speakable, "--output_file", wavPath];
  if (tts.config) args.push("--config", tts.config);

  // --text is passed as UTF-16 argv on Windows, avoiding Japanese code-page issues.
  const res = await execCommand(tts.exe, args, {
    cwd: path.dirname(tts.exe),
    env: {
      PIPER_MODEL_DIR: path.dirname(tts.model),
      OPENJTALK_DICTIONARY_PATH: OPENJTALK_DIC,
      PIPER_DICTIONARIES_PATH: PIPER_DICTS,
    },
    timeoutMs: 120_000,
  });
  if (res.code !== 0 || !fs.existsSync(wavPath)) {
    throw new Error(`piper synthesis failed (exit ${res.code}): ${res.stderr.slice(0, 300)}`);
  }
  return wavDurationMs(wavPath);
}

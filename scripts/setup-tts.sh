#!/usr/bin/env bash
# Provision piper-plus and sample voices for Linux/macOS.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

# shellcheck disable=SC1091
source "$root/scripts/runtime.sh"

tts_dir="$root/$TTS_ROOT"
piper_dir="$tts_dir/$TTS_PIPER_DIR"
model_dir="$tts_dir/$TTS_MODELS_DIR"
tmp_dir="$tts_dir/$TTS_TEMP_DIR"

mkdir -p "$piper_dir" "$model_dir" "$tmp_dir"

archive="$tmp_dir/$TTS_PIPER_LINUX_ARCHIVE_NAME"
extract_dir="$tmp_dir/piper"
piper_bin="$piper_dir/$TTS_PIPER_LINUX_BINARY"

if [ ! -x "$piper_bin" ]; then
  echo "Downloading piper-plus..."
  rm -rf "$extract_dir"
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors -o "$archive" "$TTS_PIPER_LINUX_ARCHIVE_URL"
  tar -xzf "$archive" -C "$tmp_dir"

  if [ ! -x "$extract_dir/bin/piper" ]; then
    echo "piper binary was not found in the downloaded archive." >&2
    exit 1
  fi

  cp -a "$extract_dir"/. "$piper_dir"/
fi

# Voice models live under models/<lang>/. The server picks a model by the match's language.
ja_dir="$model_dir/$TTS_JA_LANGUAGE"
en_dir="$model_dir/$TTS_EN_LANGUAGE"
mkdir -p "$ja_dir" "$en_dir"

# Japanese: Tsukuyomi-chan (multilingual model).
ja_model="$ja_dir/$TTS_JA_MODEL_FILE"
ja_config="$ja_dir/$TTS_JA_CONFIG_FILE"
if [ ! -f "$ja_model" ]; then
  echo "Downloading Japanese (Tsukuyomi) model..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$ja_model" \
    "$TTS_JA_MODEL_URL"
fi
if [ ! -f "$ja_config" ]; then
  echo "Downloading Japanese (Tsukuyomi) config..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$ja_config" \
    "$TTS_JA_CONFIG_URL"
fi

# English: a standard piper en_US voice (config filename matches "<model>.onnx.json").
en_model="$en_dir/$TTS_EN_MODEL_FILE"
en_config="$en_dir/$TTS_EN_CONFIG_FILE"
en_base="$TTS_EN_BASE_URL"
if [ ! -f "$en_model" ]; then
  echo "Downloading English (en_US-lessac-medium) model..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$en_model" \
    "$en_base/$TTS_EN_MODEL_FILE"
fi
if [ ! -f "$en_config" ]; then
  echo "Downloading English (en_US-lessac-medium) config..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$en_config" \
    "$en_base/$TTS_EN_CONFIG_FILE"
fi

export OPENJTALK_DICTIONARY_PATH="$piper_dir/share/open_jtalk/dic"
# English G2P needs the CMU dictionary; with piper and share/ side by side the executable-relative
# lookup misses it, so point piper-plus at the dicts folder explicitly (the server does the same).
export PIPER_DICTIONARIES_PATH="$piper_dir/share/piper/dicts"
export LD_LIBRARY_PATH="$piper_dir/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

test_synthesis() {
  local label="$1" model="$2" config="$3" text="$4" out="$5"
  echo "Testing $label synthesis..."
  rm -f "$out"
  "$piper_bin" --model "$model" --config "$config" --text "$text" --output_file "$out"
  if [ ! -f "$out" ]; then
    echo "piper-plus $label synthesis test failed." >&2
    exit 1
  fi
}

ja_text="$TTS_JA_SAMPLE_TEXT"
test_synthesis "$TTS_JA_SAMPLE_LABEL" "$ja_model" "$ja_config" "$ja_text" "$tts_dir/$TTS_JA_SAMPLE_FILE"
test_synthesis "$TTS_EN_SAMPLE_LABEL" "$en_model" "$en_config" "$TTS_EN_SAMPLE_TEXT" "$tts_dir/$TTS_EN_SAMPLE_FILE"

echo "TTS is ready (ja + en): $tts_dir"
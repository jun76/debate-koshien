#!/usr/bin/env bash
# Provision piper-plus and sample voices for Linux/macOS.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

tts_dir="$root/assets/tts"
piper_dir="$tts_dir/piper"
model_dir="$tts_dir/models"
tmp_dir="$tts_dir/_tmp"

mkdir -p "$piper_dir" "$model_dir" "$tmp_dir"

archive="$tmp_dir/piper-linux-x64.tar.gz"
extract_dir="$tmp_dir/piper"
piper_bin="$piper_dir/bin/piper"

if [ ! -x "$piper_bin" ]; then
  url="https://github.com/ayutaz/piper-plus/releases/latest/download/piper-linux-x64.tar.gz"
  echo "Downloading piper-plus..."
  rm -rf "$extract_dir"
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors -o "$archive" "$url"
  tar -xzf "$archive" -C "$tmp_dir"

  if [ ! -x "$extract_dir/bin/piper" ]; then
    echo "piper binary was not found in the downloaded archive." >&2
    exit 1
  fi

  cp -a "$extract_dir"/. "$piper_dir"/
fi

# Voice models live under models/<lang>/. The server picks a model by the match's language.
ja_dir="$model_dir/ja"
en_dir="$model_dir/en"
mkdir -p "$ja_dir" "$en_dir"

# Japanese: Tsukuyomi-chan (multilingual model).
ja_model="$ja_dir/tsukuyomi.onnx"
ja_config="$ja_dir/config.json"
if [ ! -f "$ja_model" ]; then
  echo "Downloading Japanese (Tsukuyomi) model..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$ja_model" \
    "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/tsukuyomi-chan-6lang-fp16.onnx"
fi
if [ ! -f "$ja_config" ]; then
  echo "Downloading Japanese (Tsukuyomi) config..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$ja_config" \
    "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/config.json"
fi

# English: a standard piper en_US voice (config filename matches "<model>.onnx.json").
en_model="$en_dir/en_US-lessac-medium.onnx"
en_config="$en_dir/en_US-lessac-medium.onnx.json"
en_base="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
if [ ! -f "$en_model" ]; then
  echo "Downloading English (en_US-lessac-medium) model..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$en_model" \
    "$en_base/en_US-lessac-medium.onnx"
fi
if [ ! -f "$en_config" ]; then
  echo "Downloading English (en_US-lessac-medium) config..."
  curl -fsSL --retry 5 --retry-delay 10 --retry-all-errors \
    -o "$en_config" \
    "$en_base/en_US-lessac-medium.onnx.json"
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

ja_text=$(printf '\343\201\260\345\243\260\345\220\210\346\210\220\343\201\256\343\203\206\343\202\271\343\203\210\343\201\247\343\201\231\343\202\202')
test_synthesis "Japanese" "$ja_model" "$ja_config" "$ja_text" "$tts_dir/sample-ja.wav"
test_synthesis "English" "$en_model" "$en_config" "This is a synthesis test." "$tts_dir/sample-en.wav"

echo "TTS is ready (ja + en): $tts_dir"
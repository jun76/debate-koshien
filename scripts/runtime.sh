DEPENDENCY_PATHS=(
  "node_modules"
  "server/node_modules/tsx/dist/cli.mjs"
  "web/node_modules/vite/bin/vite.js"
)

SERVER_NAME="server"
SERVER_HOST="127.0.0.1"
SERVER_PORT=8787
SERVER_MATCH_TOKEN="--filter @debate-koshien/server start"
SERVER_START_COMMAND="pnpm --filter @debate-koshien/server start"

WEB_NAME="web"
WEB_HOST="localhost"
WEB_PORT=56173
WEB_MATCH_TOKEN="dev:web"
WEB_PORT_SEARCH_LIMIT=100
WEB_START_COMMAND="pnpm dev:web"

TTS_ROOT="assets/tts"
TTS_PIPER_DIR="piper"
TTS_MODELS_DIR="models"
TTS_TEMP_DIR="_tmp"

TTS_PIPER_WINDOWS_ARCHIVE_NAME="piper-windows-x64.zip"
TTS_PIPER_WINDOWS_ARCHIVE_URL="https://github.com/ayutaz/piper-plus/releases/latest/download/piper-windows-x64.zip"
TTS_PIPER_WINDOWS_BINARY="piper.exe"

TTS_PIPER_LINUX_ARCHIVE_NAME="piper-linux-x64.tar.gz"
TTS_PIPER_LINUX_ARCHIVE_URL="https://github.com/ayutaz/piper-plus/releases/latest/download/piper-linux-x64.tar.gz"
TTS_PIPER_LINUX_BINARY="bin/piper"

TTS_JA_LANGUAGE="ja"
TTS_JA_MODEL_FILE="tsukuyomi.onnx"
TTS_JA_CONFIG_FILE="config.json"
TTS_JA_MODEL_URL="https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/tsukuyomi-chan-6lang-fp16.onnx"
TTS_JA_CONFIG_URL="https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/config.json"
TTS_JA_SAMPLE_FILE="sample-ja.wav"
TTS_JA_SAMPLE_TEXT=$(printf '\343\201\260\345\243\260\345\220\210\346\210\220\343\201\256\343\203\206\343\202\271\343\203\210\343\201\247\343\201\231\343\202\202')
TTS_JA_SAMPLE_LABEL="Japanese"

TTS_EN_LANGUAGE="en"
TTS_EN_MODEL_FILE="en_US-lessac-medium.onnx"
TTS_EN_CONFIG_FILE="en_US-lessac-medium.onnx.json"
TTS_EN_BASE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
TTS_EN_SAMPLE_FILE="sample-en.wav"
TTS_EN_SAMPLE_TEXT="This is a synthesis test."
TTS_EN_SAMPLE_LABEL="English"
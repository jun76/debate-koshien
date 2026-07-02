#!/usr/bin/env bash
# Start the debate app (API server + web UI) in the background.
# PIDs and logs are written under .run/. Use scripts/stop.sh to stop.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mkdir -p .run

if [ "${1:-}" = "--install" ] || [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
fi

start_component() {
  local name="$1" script="$2" url="$3"
  local pidfile=".run/$name.pid"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (PID $(cat "$pidfile"))"
    return
  fi
  nohup pnpm "$script" > ".run/$name.log" 2>&1 &
  echo $! > "$pidfile"
  echo "Started $name (PID $!) -> $url   log: .run/$name.log"
}

start_component server dev:server "http://127.0.0.1:8787"
start_component web dev:web "http://localhost:5173"

echo ""
echo "Open http://localhost:5173 in your browser. Run scripts/stop.sh to stop."

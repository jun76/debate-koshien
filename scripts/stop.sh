#!/usr/bin/env bash
# Stop the AI Debate Koshien app started by scripts/start.sh.
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

# shellcheck disable=SC1091
source "$root/scripts/runtime.sh"

stop_component() {
  local name="$1"
  local pidfile="$root/.run/$name.pid"
  [ -f "$pidfile" ] || return 0
  local pid
  pid="$(cat "$pidfile")"
  if [ -n "$pid" ]; then
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    echo "Stopped $name (PID $pid)"
  fi
  rm -f "$root/.run/$name.pid" "$root/.run/$name.url" "$root/.run/$name.port"
}

stop_component server
stop_component web

echo "Stopped."

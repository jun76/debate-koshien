#!/usr/bin/env bash
# Stop the AI Debate Koshien app started by scripts/start.sh.
set -uo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

for name in server web; do
  pidfile="$root/.run/$name.pid"
  [ -f "$pidfile" ] || continue
  pid="$(cat "$pidfile")"
  if [ -n "$pid" ]; then
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
    echo "Stopped $name (PID $pid)"
  fi
  rm -f "$pidfile"
done

echo "Stopped."

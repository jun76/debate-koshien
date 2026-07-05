#!/usr/bin/env bash
# Start the AI Debate Koshien app (API server + web UI) in the background.
# PIDs and logs are written under .run/. Use scripts/stop.sh to stop.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
mkdir -p .run

# shellcheck disable=SC1091
source "$root/scripts/runtime.sh"

dependencies_missing() {
  local rel
  for rel in "${DEPENDENCY_PATHS[@]}"; do
    [ -e "$root/$rel" ] || return 0
  done
  return 1
}

if [ "${1:-}" = "--install" ] || dependencies_missing; then
  echo "Installing dependencies..."
  pnpm install
fi

port_listening() {
  local port="$1"
  ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -q .
}

find_free_port() {
  local preferred_port="$1" limit="$2" port
  for ((port=preferred_port; port<preferred_port+limit; port++)); do
    if ! port_listening "$port"; then
      echo "$port"
      return 0
    fi
  done
  return 1
}

start_component() {
  local name="$1" command="$2" url="$3"
  local pidfile=".run/$name.pid"
  local logfile=".run/$name.log"
  if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    echo "$name already running (PID $(cat "$pidfile")) -> $url"
    return 0
  fi
  rm -f "$logfile"
  nohup sh -lc "$command" > "$logfile" 2>&1 &
  echo $! > "$pidfile"
  echo "Started $name (PID $!) -> $url   log: $logfile"
}

server_url="http://$SERVER_HOST:$SERVER_PORT"
web_port="${WEB_PORT}"
if ! web_port="$(find_free_port "$WEB_PORT" "$WEB_PORT_SEARCH_LIMIT")"; then
  echo "No available web port found from $WEB_PORT to $((WEB_PORT + WEB_PORT_SEARCH_LIMIT - 1))." >&2
  exit 1
fi
if [ "$web_port" != "$WEB_PORT" ]; then
  echo "Port $WEB_PORT is unavailable; using $web_port for web."
fi

start_component "$SERVER_NAME" "$SERVER_START_COMMAND" "$server_url"
echo "$SERVER_PORT" > .run/server.port
echo "$server_url" > .run/server.url

start_component "$WEB_NAME" "PORT=$web_port $WEB_START_COMMAND" "http://$WEB_HOST:$web_port"
echo "$web_port" > .run/web.port
echo "http://$WEB_HOST:$web_port" > .run/web.url

echo ""
echo "Open http://$WEB_HOST:$web_port in your browser. Run scripts/stop.sh to stop."

#!/usr/bin/env bash
# demo.sh - start or stop the whole PATCHWORK demo with one command.
#
#   ./demo.sh            fresh start: reset data, build, bench, start everything, seed the demo.
#                        Press Ctrl+C to stop everything.
#   ./demo.sh --keep     start without resetting or rebuilding (keeps the current data).
#   ./demo.sh stop       stop everything started by this script (from any terminal).
#
# Services: ShopLite upstream :4200, control :4000, live :4100, preview :4300, UI :5173.
# Logs: data/logs/<service>.log   (DEMO_NO_OPEN=1 skips opening the browser)
set -u

cd "$(dirname "$0")"
ROOT="$(pwd)"
LOGS="$ROOT/data/logs"
PORTS="4000 4100 4200 4300 5173"
UI="http://localhost:5173"

say() { printf '\033[1m[demo]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[demo] %s\033[0m\n' "$*" >&2; exit 1; }

port_pids() { lsof -ti "tcp:$1" -sTCP:LISTEN 2>/dev/null; }

stop_all() {
  say "stopping..."
  # Put ShopLite back on v1 so the next demo starts from the original site.
  curl -s -m 2 -X POST localhost:4200/__upstream/version \
    -H 'content-type: application/json' -d '{"version":"v1"}' >/dev/null 2>&1 || true
  if [ -f "$LOGS/pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done <"$LOGS/pids"
    rm -f "$LOGS/pids"
  fi
  # npm starts child processes; free every demo port whatever started it.
  sleep 1
  for port in $PORTS; do
    pids="$(port_pids "$port")"
    [ -n "$pids" ] && kill $pids 2>/dev/null || true
  done
  say "stopped."
}

wait_for() { # url label seconds
  local i=0
  until curl -s -o /dev/null -m 2 "$1"; do
    i=$((i + 1))
    [ "$i" -ge "$(($3 * 2))" ] && fail "$2 did not start in $3 s - see $LOGS"
    sleep 0.5
  done
  say "$2 is up ($1)"
}

start_bg() { # name command...
  local name="$1"
  shift
  "$@" >"$LOGS/$name.log" 2>&1 &
  echo $! >>"$LOGS/pids"
}

if [ "${1:-}" = "stop" ]; then
  stop_all
  exit 0
fi

KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

command -v node >/dev/null || fail "Node.js is not installed (needs v24)."
for port in $PORTS; do
  [ -n "$(port_pids "$port")" ] && fail "port $port is already in use. Run ./demo.sh stop first."
done

if [ ! -d node_modules ]; then
  say "installing dependencies (first run)..."
  npm ci || fail "npm ci failed"
  npx playwright install chromium || fail "playwright install failed"
fi
[ -f .env ] || cp .env.example .env

if [ "$KEEP" = 0 ]; then
  say "resetting data and building (about 30 s)..."
  npm run reset >/dev/null 2>&1 || fail "npm run reset failed"
  npm run build >/dev/null 2>&1 || fail "npm run build failed (run it directly to see why)"
  npm run bench -- --set all >/dev/null 2>&1 || fail "npm run bench failed"
elif [ ! -f packages/runtime/dist/patchwork-runtime.js ] || [ ! -f apps/web/dist/index.html ]; then
  say "no build found, building..."
  npm run build >/dev/null 2>&1 || fail "npm run build failed (run it directly to see why)"
fi

mkdir -p "$LOGS"
rm -f "$LOGS/pids"
trap 'echo; stop_all; exit 0' INT TERM

# Ask PATCHWORK uses a local model when Ollama is running (http://localhost:11434); warm it up once.
if curl -s -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
  export PW_ASSIST_PROVIDER="${PW_ASSIST_PROVIDER:-ollama}"
  MODEL="${PW_ASSIST_MODEL:-qwen3:4b}"
  say "Ollama is running: Ask PATCHWORK uses $MODEL (warming it up)"
  curl -s -m 60 http://localhost:11434/api/chat \
    -d "{\"model\":\"$MODEL\",\"stream\":false,\"think\":false,\"format\":\"json\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply {}\"}]}" >/dev/null 2>&1 &
else
  say "Ollama is not running: Ask PATCHWORK is off (the manual fix flow still works)"
fi

start_bg target npm run target
wait_for http://localhost:4200/ "ShopLite upstream" 20
start_bg server npx tsx apps/server/src/main.ts  # already built above
wait_for http://localhost:4000/api/users "PATCHWORK server" 90
start_bg web npm run dev:web
wait_for "$UI" "UI" 30

if [ "$KEEP" = 0 ]; then
  say "seeding the demo (P1-P3 merged, R1 verified and live, P4 approved)..."
  npm run demo:setup >"$LOGS/demo-setup.log" 2>&1 || { cat "$LOGS/demo-setup.log"; stop_all; fail "demo:setup failed"; }
fi

cat <<EOF

  PATCHWORK is running.

    UI (use this for the demo)   $UI
    Raw shop (broken checkout)   http://localhost:4200/cart
    Live through PATCHWORK       http://localhost:4100/cart

  Logs: $LOGS
  Press Ctrl+C here to stop everything (or run ./demo.sh stop elsewhere).

EOF

if [ -z "${DEMO_NO_OPEN:-}" ] && command -v open >/dev/null; then open "$UI"; fi

# Stay in the foreground until Ctrl+C; stop everything if a service dies.
while true; do
  sleep 2
  if [ ! -f "$LOGS/pids" ]; then # ./demo.sh stop ran in another terminal
    say "stopped from another terminal."
    exit 0
  fi
  for port in 4000 4200 5173; do
    if [ -z "$(port_pids "$port")" ]; then
      say "the service on :$port stopped unexpectedly - see $LOGS"
      stop_all
      exit 1
    fi
  done
done

#!/bin/sh
# The schedule's week grid, in headless Chrome. See grid-tests.js for the contract.
#
# By default it starts its OWN scratch server — port 8091, a copy of ./data with
# stats/ removed — and deletes it after, per HANDOFF: browser checks never run on
# Paul's app on 8081 (the first grid runs did, 2026-09-29, and their page views
# landed in his local usage counters). APP=<url> targets an already-running server
# instead, e.g. an old build to show the tests fail there.
cd "$(dirname "$0")"
HERE="$PWD"
ROOT="$(cd ../.. && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME"; exit 1; }

SCRATCH=""
SERVER_PID=""
# Chrome keeps writing its profile for a moment after the kill; wait it out
# before deleting, or the folder is left behind.
cleanup() {
  pkill -f "grid-chrome-profile" 2>/dev/null || true
  i=0; while pgrep -f "grid-chrome-profile" >/dev/null && [ $i -lt 20 ]; do sleep 0.25; i=$((i + 1)); done
  rm -rf "$HERE/grid-chrome-profile" "$HERE/chrome.log" "$HERE/grid.out"
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$SCRATCH" ] && rm -rf "$SCRATCH"
}
trap cleanup EXIT
cleanup

if [ -z "$APP" ]; then
  if lsof -nP -iTCP:8091 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port 8091 is busy — stop what is on it, or pass APP=<url>"; exit 1
  fi
  SCRATCH="$(mktemp -d)"
  [ -d "$ROOT/data" ] && cp -R "$ROOT/data/." "$SCRATCH/"
  rm -rf "$SCRATCH/stats"      # never count test page views
  (cd "$ROOT" && PORT=8091 DATA_DIR="$SCRATCH" exec node tools/start.js > "$SCRATCH/server.log" 2>&1) &
  APP="http://127.0.0.1:8091/"
  # Wait for the archive filter to settle, not just for the port: the grid
  # needs the published week, which the server warms after boot.
  i=0
  until curl -sf -m 2 "${APP}healthz" | grep -q '"basis":"schedule"'; do
    i=$((i + 1)); [ $i -gt 60 ] && { echo "scratch server did not settle:"; tail -20 "$SCRATCH/server.log"; exit 1; }
    sleep 1
  done
  # The listener's own pid, whatever tools/start.js spawned, so cleanup stops it.
  SERVER_PID="$(lsof -nP -tiTCP:8091 -sTCP:LISTEN | head -1)"
fi
export APP
curl -sf -m 3 "${APP}healthz" >/dev/null || { echo "no app at $APP"; exit 1; }

# Port 9226: clear of live-stream 9222, touch 9223, episode-rail 9224, schedule 9225.
"$CHROME" --headless=new --mute-audio \
  --remote-debugging-port=9226 \
  --user-data-dir="$HERE/grid-chrome-profile" \
  --no-first-run --no-default-browser-check \
  --disable-gpu --window-size=1400,1000 about:blank > chrome.log 2>&1 &
# Wait for the debugging port rather than a fixed sleep: a cold Chrome can take
# longer than 3.5s, and the test then fails to connect instead of testing.
i=0
until curl -sf -m 1 http://127.0.0.1:9226/json/version >/dev/null; do
  i=$((i + 1)); [ $i -gt 30 ] && { echo "Chrome did not open port 9226:"; cat chrome.log; exit 1; }
  sleep 0.5
done

# The test's own exit status, not grep's: a pipe would report success for a
# failing run.
node --experimental-websocket grid-tests.js > grid.out 2>&1; status=$?
grep -v ExperimentalWarning grid.out | grep -v 'Use `node'; rm -f grid.out
exit $status

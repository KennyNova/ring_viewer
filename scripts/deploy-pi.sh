#!/bin/bash
# Deploys origin/main to the Raspberry Pi and restarts the pm2 app "ringViewer".
#
# Install on the Pi as root (the root-owned copy is what sudo runs, so nobody who can
# edit the repo can use this script to become root):
#
#   install -m 755 -o root -g root scripts/deploy-pi.sh /usr/local/bin/deploy-ringviewer
#
# To let a non-root user (e.g. "claude", key-only SSH) run just this script, as root:
#
#   echo 'claude ALL=(root) NOPASSWD: /usr/local/bin/deploy-ringviewer' > /etc/sudoers.d/deploy-ringviewer
#   chmod 440 /etc/sudoers.d/deploy-ringviewer && visudo -c
#
# Usage (needs root, e.g. through a narrow sudoers rule):
#   deploy-ringviewer [deploy]   pull main, build, smoke-test, swap in, restart, roll back on failure
#   deploy-ringviewer status     what is live: commit, pm2 state, HTTP check
#   deploy-ringviewer logs       last 60 lines of the app's pm2 logs
#
# git, npm and the build run as the folder's owner; only the pm2 restart runs as root,
# because pm2 for this app lives in root's pm2 daemon.
set -euo pipefail

APP=/local-files/applications/ringViewer
OWNER=dietpi
PM2_APP=ringViewer
LIVE_PORT=3002
TEST_PORT=3099
BRANCH=main

log() { printf '[%s] %s\n' "$(date +%T)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root (use sudo)"
[ -d "$APP/.git" ] || die "$APP is not a git checkout"

OWNER_HOME=$(getent passwd "$OWNER" | cut -d: -f6)
as_owner() {
  runuser -u "$OWNER" -- env PATH=/usr/local/bin:/usr/bin:/bin HOME="$OWNER_HOME" \
    NEXT_TELEMETRY_DISABLED=1 "$@"
}
pm2_root() { env HOME=/root PM2_HOME=/root/.pm2 PATH=/usr/local/bin:/usr/bin:/bin pm2 "$@"; }
http_code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@" 2>/dev/null || true; }

cd "$APP"

cmd_status() {
  log "commit on disk: $(as_owner git log --format='%h %ad %s' --date=short -1)"
  pm2_root describe "$PM2_APP" | grep -E 'status|uptime|restarts|script path|exec cwd' || true
  log "GET / on :$LIVE_PORT -> $(http_code "http://127.0.0.1:$LIVE_PORT/")"
}

cmd_logs() { pm2_root logs "$PM2_APP" --lines 60 --nostream; }

cmd_deploy() {
  local smoke_pid=""
  cleanup() { [ -n "$smoke_pid" ] && kill "$smoke_pid" 2>/dev/null || true; rm -rf .next-build; }
  trap cleanup EXIT

  log "Updating $BRANCH"
  # The Pi checkout carries file-mode noise (every +x file shows as modified), which would
  # make a plain pull refuse to run, so ignore mode and reset to the remote. Ignored files
  # such as public/3d (the ring models) are untouched by reset.
  as_owner git config core.fileMode false
  as_owner git fetch --quiet origin "$BRANCH"
  local before after
  before=$(as_owner git rev-parse --short HEAD)
  as_owner git reset --hard --quiet "origin/$BRANCH"
  after=$(as_owner git rev-parse --short HEAD)
  log "$before -> $after: $(as_owner git log --format=%s -1)"

  log "Installing dependencies"
  # --omit=dev: the build tools are regular dependencies, and this skips puppeteer, which would
  # download Chromium for ARM on every deploy (it is only used to render thumbnails on a PC)
  as_owner nice -n 10 npm ci --omit=dev --legacy-peer-deps --no-audit --no-fund --loglevel=error

  log "Building into .next-build (the live site keeps serving from .next)"
  rm -rf .next-build
  as_owner env NEXT_DIST_DIR=.next-build NODE_OPTIONS=--max-old-space-size=2048 \
    nice -n 10 npm run build

  log "Smoke-testing the new build on :$TEST_PORT"
  as_owner env NEXT_DIST_DIR=.next-build PORT=$TEST_PORT \
    node node_modules/next/dist/bin/next start -p "$TEST_PORT" >/tmp/ringviewer-smoke.log 2>&1 &
  smoke_pid=$!
  local ok=""
  for _ in $(seq 1 30); do
    [ "$(http_code "http://127.0.0.1:$TEST_PORT/")" = "200" ] && ok=1 && break
    sleep 2
  done
  [ -n "$ok" ] || { tail -20 /tmp/ringviewer-smoke.log; die "new build did not answer on :$TEST_PORT; live site untouched"; }
  # /random-ring redirects to a real ring page, which exercises the models folder too
  [ "$(http_code -L "http://127.0.0.1:$TEST_PORT/random-ring")" = "200" ] \
    || die "ring page failed in the new build; live site untouched"
  kill "$smoke_pid" 2>/dev/null || true; smoke_pid=""

  log "Swapping the new build in and restarting"
  rm -rf .next-prev .next-failed
  as_owner mv .next .next-prev 2>/dev/null || true
  as_owner mv .next-build .next
  pm2_root restart "$PM2_APP" >/dev/null

  local live=""
  for _ in $(seq 1 30); do
    [ "$(http_code "http://127.0.0.1:$LIVE_PORT/")" = "200" ] && live=1 && break
    sleep 2
  done
  if [ -z "$live" ]; then
    log "Live site did not come back, rolling back to the previous build"
    as_owner mv .next .next-failed
    as_owner mv .next-prev .next
    pm2_root restart "$PM2_APP" >/dev/null
    die "rolled back; the failed build is in $APP/.next-failed"
  fi
  log "Live on :$LIVE_PORT at $after"
}

case "${1:-deploy}" in
  deploy) cmd_deploy ;;
  status) cmd_status ;;
  logs)   cmd_logs ;;
  *)      echo "usage: $0 [deploy|status|logs]" >&2; exit 2 ;;
esac

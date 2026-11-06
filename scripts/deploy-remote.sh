#!/usr/bin/env bash
# Server-side deploy steps for AutoGTM on the Oracle VM.
#
# Runs inside the checkout (/home/ubuntu/chad-gtm) AFTER it has been
# fast-forwarded to origin/main. Called by .github/workflows/deploy.yml and
# scripts/deploy_remote_chadgtm.py, which take the deploy lock and pull first;
# see docs/OPERATIONS.md.
#
#   npm ci -> pg_dump backup -> db:migrate -> build web -> pm2 reload -> health check
#
# Only ever touches the chadgtm-web and chadgtm-worker PM2 processes. Never
# touches /home/ubuntu/smart-reach or SmartReach's processes, never "pm2 all".
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/home/ubuntu/.openoutreach-deploy.lock}"
WEB_APP="chadgtm-web"
WORKER_APP="chadgtm-worker"
WEB_PORT="${WEB_PORT:-3005}"
HEALTH_URL="http://127.0.0.1:${WEB_PORT}/api/health"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"

cd "$APP_DIR"

# The callers hold the lock already (fd 9). Taking it again here on a new fd
# would deadlock, so only lock when run by hand.
if [[ -z "${DEPLOY_LOCK_HELD:-}" ]]; then
  exec 9>>"$LOCK_FILE"
  echo "==> waiting for deploy lock $LOCK_FILE"
  flock -w 1800 9 || { echo "!! could not get the deploy lock within 30 minutes" >&2; exit 1; }
fi

# Never let a process that outlives the deploy (e.g. a pm2 daemon started on
# first use) inherit the lock fd, or every later deploy would block on it.
pm2() { command pm2 "$@" 9>&-; }

SHA="$(git rev-parse --short=12 HEAD)"
PREVIOUS_SHA="${PREVIOUS_SHA:-unknown}"
BACKUP_FILE=""
STEP="preflight"
RELOADED=0

dump_logs() {
  echo "---- pm2 status ----"
  pm2 describe "$WEB_APP" 2>/dev/null | grep -E 'status|restarts|uptime' || true
  pm2 describe "$WORKER_APP" 2>/dev/null | grep -E 'status|restarts|uptime' || true
  echo "---- $WEB_APP logs ----"
  pm2 logs "$WEB_APP" --lines 80 --nostream 2>&1 || true
  echo "---- $WORKER_APP logs ----"
  pm2 logs "$WORKER_APP" --lines 80 --nostream 2>&1 || true
}

on_error() {
  local code=$?
  # errtrace also fires this in subshells; report once, from the main shell.
  [[ "$BASHPID" == "$$" ]] || exit "$code"
  echo "!! deploy of $SHA FAILED during: $STEP (exit $code)" >&2
  if (( RELOADED )); then dump_logs; fi
  echo "!! previous commit: $PREVIOUS_SHA" >&2
  [[ -n "$BACKUP_FILE" ]] && echo "!! pre-deploy database backup: $BACKUP_FILE" >&2
  echo "!! rollback steps: docs/OPERATIONS.md, section 'Rollback'" >&2
  exit "$code"
}
trap on_error ERR

step() { STEP="$1"; echo; echo "==> $1"; }

step "preflight"
echo "deploying $SHA (previous $PREVIOUS_SHA) in $APP_DIR"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "!! Node $(node -v) found; AutoGTM needs Node >= 22.13 (node:sqlite)" >&2; false; }
[[ -f apps/web/.env.local ]] || { echo "!! apps/web/.env.local is missing" >&2; false; }
if [[ ! -s data/leads.db && ! -s apps/web/data/leads.db ]]; then
  echo "!! data/leads.db is missing: the lead directory would silently be empty." >&2
  echo "!! Copy it to the VM first (docs/OPERATIONS.md, 'Lead directory')." >&2
  false
fi
type -P pm2 >/dev/null || { echo "!! pm2 not found" >&2; false; }

step "install dependencies (npm ci)"
npm ci --no-audit --no-fund

step "back up database"
bash scripts/backup-db.sh "predeploy-$SHA"
BACKUP_FILE="${BACKUP_DIR:-$HOME/backups}/chadgtm-predeploy-$SHA.dump"

step "apply database migrations"
npm run db:migrate

step "build web app"
npm run build --workspace @smartreach/web

reload_or_start() {
  local name="$1" cwd="$2" cmd="$3"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 reload "$name" --update-env
  else
    echo "$name is not registered with pm2 yet; starting it"
    pm2 start "$cmd" --name "$name" --cwd "$cwd"
  fi
}

# Prints "<status> <restart count>" for a pm2 app; never fails.
restarts() {
  { pm2 jlist 2>/dev/null || echo "[]"; } | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        // pm2 may print warnings before the JSON array.
        const i = s.search(/\[\s*(\{|\])/);
        const p = JSON.parse(i >= 0 ? s.slice(i) : s).find((x) => x.name === process.argv[1]);
        console.log(p ? `${p.pm2_env.status} ${p.pm2_env.restart_time}` : "missing -1");
      } catch { console.log("unknown -1"); }
    });' "$1" || echo "unknown -1"
}

step "reload $WEB_APP and $WORKER_APP"
RELOADED=1
reload_or_start "$WEB_APP" "$APP_DIR/apps/web" "npx next start -p $WEB_PORT"
reload_or_start "$WORKER_APP" "$APP_DIR/packages/email-engine" "npm run worker"

step "health check $HEALTH_URL"
body=""
for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
  if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
    echo "healthy after $i attempt(s): $body"
    break
  fi
  body=""
  sleep 3
done
[[ -n "$body" ]] || { echo "!! $HEALTH_URL did not return 200 after $HEALTH_ATTEMPTS attempts" >&2; false; }
if [[ "$body" == *'"stale":true'* ]]; then
  echo "warning: engine heartbeat is stale (normal right after a reload or before the engine writes heartbeats)"
fi

step "check $WORKER_APP is stable"
read -r status_before restarts_before <<<"$(restarts "$WORKER_APP")"
sleep 20
read -r status_after restarts_after <<<"$(restarts "$WORKER_APP")"
if [[ "$status_after" == "unknown" ]]; then
  echo "warning: could not read pm2 status; check 'pm2 status' by hand"
elif [[ "$status_after" != "online" || "$restarts_after" != "$restarts_before" ]]; then
  echo "!! $WORKER_APP is not stable (status $status_before -> $status_after, restarts $restarts_before -> $restarts_after)" >&2
  false
fi

step "save pm2 process list"
pm2 save

trap - ERR
echo
echo "==> deployed $SHA (previous $PREVIOUS_SHA). Backup: $BACKUP_FILE"

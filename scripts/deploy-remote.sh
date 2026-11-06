#!/usr/bin/env bash
# Server-side deploy steps for AutoGTM on the Oracle VM.
#
# Called by .github/workflows/deploy.yml and scripts/deploy_remote_chadgtm.py,
# which take the deploy lock, `git fetch` origin/main WITHOUT touching the
# checkout, and run this script from the fetched commit with
# TARGET_SHA=<fetched commit>. See docs/OPERATIONS.md, "Deploy".
#
#   preflight (env files, node, pg_dump, leads.db, disk) -> fast-forward to TARGET_SHA
#   -> npm ci (old node_modules kept as a backup) -> pg_dump backup -> db:migrate
#   -> build web (old .next kept as a backup) -> pm2 reload -> health check
#
# Any failure BEFORE the pm2 reload puts the previous commit, node_modules and
# .next back, so the running processes (and any restart of them) keep running
# the old release. A failure AFTER the reload does not roll back automatically;
# the log says how.
#
# Only ever touches the chadgtm-web and chadgtm-worker PM2 processes. Never
# touches /home/ubuntu/smart-reach or SmartReach's processes, never "pm2 all".
# Never prints application logs: this output ends up in a public Actions log.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# Where this script's helpers live. The workflow runs a copy extracted from
# the target commit before the checkout moves.
SCRIPTS_DIR="${DEPLOY_SCRIPTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/home/ubuntu/.openoutreach-deploy.lock}"
WEB_APP="chadgtm-web"
WORKER_APP="chadgtm-worker"
WEB_PORT="${WEB_PORT:-3005}"
HEALTH_URL="http://127.0.0.1:${WEB_PORT}/api/health"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-30}"
HEALTH_INTERVAL_S="${HEALTH_INTERVAL_S:-3}"
STABILITY_WAIT_S="${STABILITY_WAIT_S:-20}"
EXPECTED_DB="${DEPLOY_DB_NAME:-chadgtm}"
MIN_FREE_MB="${DEPLOY_MIN_FREE_MB:-1024}"
# Fail a migration that has to wait for a lock instead of queueing all app traffic behind it.
MIGRATE_LOCK_TIMEOUT="${MIGRATE_LOCK_TIMEOUT:-15s}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
export BACKUP_DIR

cd "$APP_DIR"
STATE_FILE="${DEPLOY_STATE_FILE:-$(git rev-parse --absolute-git-dir)/chadgtm-last-deployed}"

# The callers hold the lock already (fd 9). Taking it again here on a new fd
# would deadlock, so only lock when run by hand.
if [[ -z "${DEPLOY_LOCK_HELD:-}" ]]; then
  exec 9>>"$LOCK_FILE"
  echo "==> waiting for deploy lock $LOCK_FILE"
  flock -w 600 9 || { echo "!! could not get the deploy lock within 10 minutes" >&2; exit 1; }
fi

# Never let a process that outlives the deploy (e.g. a pm2 daemon started on
# first use) inherit the lock fd, or every later deploy would block on it.
pm2() { command pm2 "$@" 9>&-; }

ROLLBACK_SHA="$(git rev-parse HEAD)"          # what is checked out and built right now
TARGET_SHA="$(git rev-parse --verify "${TARGET_SHA:-HEAD}^{commit}")"
SHA="${TARGET_SHA:0:12}"
LAST_GOOD="$(head -c 64 "$STATE_FILE" 2>/dev/null | tr -cd '0-9a-f' || true)"
LAST_GOOD="${LAST_GOOD:-unknown}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NEXT_DIR="apps/web/.next"

BACKUP_FILE=""
STEP="preflight"
MOVED_HEAD=0
CHANGED=0      # set once anything on disk was changed (checkout, node_modules, .next)
RELOADED=0
STARTED_NEW=0
NEXT_SNAPSHOT=0
NM_SNAPSHOT=0
NM_DIRS=()

nm_dirs() {
  local d
  for d in node_modules apps/*/node_modules packages/*/node_modules; do
    [[ -d "$d" && ! -L "$d" ]] && printf '%s\n' "$d"
  done
  return 0
}

# Cheap copy of a directory: hard links where possible (npm ci and next build
# delete and recreate files rather than rewriting them, so the copy keeps the
# old content), a plain copy otherwise.
snapshot_dir() {
  local src="$1" dst="$2"
  rm -rf "$dst"
  cp -al "$src" "$dst" 2>/dev/null || { rm -rf "$dst"; cp -a "$src" "$dst"; }
}

drop_snapshots() {
  local d
  for d in node_modules apps/*/node_modules packages/*/node_modules; do
    [[ -e "$d.prev" ]] && rm -rf "$d.prev"
  done
  rm -rf "$NEXT_DIR.prev"
  return 0
}

status_lines() {
  echo "---- pm2 status (logs are not printed here: read them on the VM) ----"
  local app
  for app in "$WEB_APP" "$WORKER_APP"; do
    echo "$app: $(restarts "$app" | awk '{print "status " $1 ", restarts " $2}')"
  done
  echo "on the VM: pm2 logs $WEB_APP --lines 200 / pm2 logs $WORKER_APP --lines 200"
}

# Put the previous commit, node_modules and .next back. Only used before the
# pm2 reload, while the old processes are still the ones running.
restore_previous() {
  local ok=1 d
  echo "!! restoring the previous release ($ROLLBACK_SHA)" >&2
  if (( MOVED_HEAD )); then
    git reset --quiet --hard "$ROLLBACK_SHA" || ok=0
  fi
  if (( NM_SNAPSHOT )); then
    # node_modules dirs the new install created that the old release did not have.
    while IFS= read -r d; do
      [[ -e "$d.prev" ]] || rm -rf "$d"
    done < <(nm_dirs)
    for d in ${NM_DIRS[@]+"${NM_DIRS[@]}"}; do
      if [[ -d "$d.prev" ]]; then
        rm -rf "$d" && mv "$d.prev" "$d" || ok=0
      else
        ok=0
      fi
    done
  fi
  if (( NEXT_SNAPSHOT )) && [[ -d "$NEXT_DIR.prev" ]]; then
    # Keep the build cache; it is only a cache.
    if [[ -d "$NEXT_DIR/cache" && ! -e "$NEXT_DIR.prev/cache" ]]; then mv "$NEXT_DIR/cache" "$NEXT_DIR.prev/cache" || true; fi
    rm -rf "$NEXT_DIR" && mv "$NEXT_DIR.prev" "$NEXT_DIR" || ok=0
  fi
  if (( ok )); then
    echo "!! restored: the checkout, node_modules and $NEXT_DIR are back at $ROLLBACK_SHA" >&2
  else
    echo "!! RESTORE INCOMPLETE: follow docs/OPERATIONS.md, 'Rollback', before anything restarts" >&2
  fi
}

on_error() {
  local code=$?
  # errtrace also fires this in subshells; report once, from the main shell.
  [[ "$BASHPID" == "$$" ]] || exit "$code"
  trap - ERR
  set +e
  echo "!! deploy of $SHA FAILED during: $STEP (exit $code)" >&2
  if (( RELOADED )); then
    status_lines
    echo "!! the new release is running; it was NOT rolled back automatically" >&2
    echo "!! last successfully deployed commit: $LAST_GOOD (checked out before this deploy: ${ROLLBACK_SHA:0:12})" >&2
    [[ -d node_modules.prev ]] && echo "!! the previous node_modules and .next are kept as *.prev for a quick rollback" >&2
  elif (( CHANGED )); then
    restore_previous
  else
    echo "!! nothing was changed on the server" >&2
  fi
  [[ -n "$BACKUP_FILE" ]] && echo "!! pre-deploy database backup: $BACKUP_FILE" >&2
  echo "!! rollback steps: docs/OPERATIONS.md, section 'Rollback'" >&2
  exit "$code"
}
trap on_error ERR

step() { STEP="$1"; echo; echo "==> $1"; }

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

# ---------------------------------------------------------------------------
# Preflight: everything that can be checked without changing anything.
step "preflight"
echo "deploying $SHA (checked out now: ${ROLLBACK_SHA:0:12}, last successful deploy: ${LAST_GOOD:0:12}) in $APP_DIR"
git merge-base --is-ancestor "$ROLLBACK_SHA" "$TARGET_SHA" \
  || { echo "!! $SHA is not a fast-forward of the checked-out commit" >&2; false; }
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "!! the checkout has local changes to tracked files (git status); refusing to deploy over them" >&2
  false
fi
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || { echo "!! Node $(node -v) found; AutoGTM needs Node >= 22.13 (node:sqlite)" >&2; false; }
[[ -f apps/web/.env.local ]] || { echo "!! apps/web/.env.local is missing" >&2; false; }
if [[ ! -s data/leads.db && ! -s apps/web/data/leads.db ]]; then
  echo "!! data/leads.db is missing: the lead directory would silently be empty." >&2
  echo "!! Copy it to the VM first (docs/OPERATIONS.md, 'Lead directory')." >&2
  false
fi
type -P pm2 >/dev/null || { echo "!! pm2 not found" >&2; false; }
# backup-db.sh checks pg_dump against the server's own major version before
# anything is migrated; here we only need the tools to exist.
type -P pg_dump >/dev/null || { echo "!! pg_dump not found (install the postgresql-client matching the server)" >&2; false; }
type -P pg_restore >/dev/null || { echo "!! pg_restore not found (install the postgresql-client matching the server)" >&2; false; }
free_mb="$(df -Pk "$APP_DIR" | awk 'NR==2 {print int($4/1024)}')"
if [[ "$free_mb" =~ ^[0-9]+$ ]] && (( free_mb < MIN_FREE_MB )); then
  echo "!! only ${free_mb} MB free on the disk; need ${MIN_FREE_MB} MB for the install and build backups" >&2
  false
fi
# Web, worker and migrations must all use the chadgtm database, and web and
# worker must share their secrets. Prints names only, never values.
{ pm2 jlist 2>/dev/null || echo "[]"; } \
  | node "$SCRIPTS_DIR/check-deploy-env.mjs" --app-dir "$APP_DIR" --expect-db "$EXPECTED_DB" --pm2-jlist -
drop_snapshots   # leftovers from an earlier failed deploy

# ---------------------------------------------------------------------------
step "check out $SHA"
if [[ "$TARGET_SHA" != "$ROLLBACK_SHA" ]]; then
  CHANGED=1
  MOVED_HEAD=1
  git merge --quiet --ff-only "$TARGET_SHA"
fi

step "install dependencies (npm ci; previous node_modules kept until the deploy succeeds)"
while IFS= read -r d; do
  NM_DIRS+=("$d")
done < <(nm_dirs)
CHANGED=1
for d in ${NM_DIRS[@]+"${NM_DIRS[@]}"}; do
  snapshot_dir "$d" "$d.prev"
done
NM_SNAPSHOT=1
npm ci --no-audit --no-fund

step "back up database"
# A unique name per run: a re-run of the same commit never overwrites the
# pre-migration dump of the first run.
bash scripts/backup-db.sh "predeploy-$SHA-$STAMP"
BACKUP_FILE="$BACKUP_DIR/chadgtm-predeploy-$SHA-$STAMP.dump"

step "apply database migrations (lock_timeout $MIGRATE_LOCK_TIMEOUT)"
PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c lock_timeout=$MIGRATE_LOCK_TIMEOUT" npm run db:migrate

step "build web app (previous build kept until the deploy succeeds)"
if [[ -d "$NEXT_DIR" ]]; then
  rm -rf "$NEXT_DIR.prev"
  mkdir -p "$NEXT_DIR.prev"
  for e in "$NEXT_DIR"/* "$NEXT_DIR"/.[!.]*; do
    [[ -e "$e" && "$(basename "$e")" != cache ]] || continue
    snapshot_dir "$e" "$NEXT_DIR.prev/$(basename "$e")"
  done
  NEXT_SNAPSHOT=1
fi
npm run build --workspace @smartreach/web

reload_or_start() {
  local name="$1" cwd="$2" cmd="$3"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 reload "$name" --update-env >/dev/null
    echo "$name reloaded"
  else
    echo "$name is not registered with pm2 yet; starting it"
    pm2 start "$cmd" --name "$name" --cwd "$cwd" >/dev/null
    STARTED_NEW=1
  fi
}

step "reload $WEB_APP and $WORKER_APP"
RELOADED=1
reload_or_start "$WEB_APP" "$APP_DIR/apps/web" "npx next start -p $WEB_PORT"
reload_or_start "$WORKER_APP" "$APP_DIR/packages/email-engine" "npm run worker"

step "health check $HEALTH_URL"
body=""
for ((i = 1; i <= HEALTH_ATTEMPTS; i++)); do
  if body="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)"; then
    echo "healthy after $i attempt(s)"
    break
  fi
  body=""
  sleep "$HEALTH_INTERVAL_S"
done
[[ -n "$body" ]] || { echo "!! $HEALTH_URL did not return 200 after $HEALTH_ATTEMPTS attempts" >&2; false; }
if [[ "$body" == *'"stale":true'* ]]; then
  echo "warning: engine heartbeat is stale (normal right after a reload or before the engine writes heartbeats)"
fi

step "check $WORKER_APP is stable"
read -r status_before restarts_before <<<"$(restarts "$WORKER_APP")"
sleep "$STABILITY_WAIT_S"
read -r status_after restarts_after <<<"$(restarts "$WORKER_APP")"
if [[ "$status_after" == "unknown" ]]; then
  echo "warning: could not read pm2 status; check 'pm2 status' by hand"
elif [[ "$status_after" != "online" || "$restarts_after" != "$restarts_before" ]]; then
  echo "!! $WORKER_APP is not stable (status $status_before -> $status_after, restarts $restarts_before -> $restarts_after)" >&2
  false
fi

step "pm2 process list"
# `pm2 save` snapshots the whole daemon, SmartReach's processes included, so
# only save when this deploy registered a new chadgtm process. A reload does
# not change what `pm2 resurrect` starts.
if (( STARTED_NEW )); then
  echo "a chadgtm process was registered: saving the pm2 process list (check 'pm2 status' on the VM: the save includes every process in the daemon)"
  pm2 save >/dev/null
else
  echo "process definitions unchanged; not running pm2 save"
fi

step "finish"
printf '%s\n' "$TARGET_SHA" > "$STATE_FILE.tmp" && mv -f "$STATE_FILE.tmp" "$STATE_FILE"
drop_snapshots

trap - ERR
echo
echo "==> deployed $SHA (previous successful deploy: ${LAST_GOOD:0:12}). Backup: $BACKUP_FILE"

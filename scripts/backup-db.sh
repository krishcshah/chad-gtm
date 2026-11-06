#!/usr/bin/env bash
# Back up the AutoGTM Postgres database with pg_dump (custom format).
#
#   scripts/backup-db.sh                    -> $BACKUP_DIR/chadgtm-<UTC timestamp>.dump
#   scripts/backup-db.sh <label>            -> $BACKUP_DIR/chadgtm-<label>.dump
#
# Never overwrites an existing dump: a second run with the same label fails.
# The deploy uses predeploy-<sha>-<UTC timestamp>, unique per run.
#
# Env (all optional):
#   DATABASE_URL     default: read from $ENV_FILE (never printed)
#   ENV_FILE         default: <repo>/apps/web/.env.local
#   BACKUP_DIR       default: $HOME/backups
#   RETENTION_DAYS   default: 7  (older chadgtm-*.dump files in BACKUP_DIR are removed)
#
# Restore: see docs/OPERATIONS.md ("Restore a backup").
set -euo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/apps/web/.env.local}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
LABEL="${1:-$(date -u +%Y%m%d-%H%M%S)}"

if [[ ! "$LABEL" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "[backup] invalid label: only letters, digits, '.', '_' and '-' are allowed" >&2
  exit 2
fi
if [[ ! "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "[backup] RETENTION_DAYS must be a positive integer" >&2
  exit 2
fi
command -v pg_dump >/dev/null || { echo "[backup] pg_dump not found (install postgresql-client-17 from the PGDG apt repo)" >&2; exit 1; }
# Production Postgres is 17.x. pg_dump refuses to dump a newer server, and the
# Ubuntu default postgresql-client is older, so check before relying on it.
PG_MIN_MAJOR="${PG_MIN_MAJOR:-17}"
pg_dump_major="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"
if [[ ! "$pg_dump_major" =~ ^[0-9]+$ ]] || (( pg_dump_major < PG_MIN_MAJOR )); then
  echo "[backup] pg_dump ${pg_dump_major:-?} is too old: the server is Postgres 17.x, need pg_dump >= $PG_MIN_MAJOR (apt install postgresql-client-17 from the PGDG repo)" >&2
  exit 1
fi
command -v pg_restore >/dev/null || { echo "[backup] pg_restore not found (install postgresql-client-17)" >&2; exit 1; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "[backup] DATABASE_URL is not set and $ENV_FILE does not exist" >&2
    exit 1
  fi
  # Last assignment wins, as with dotenv. Handles "quoted", 'quoted' and bare values.
  line="$(grep -E '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=' "$ENV_FILE" | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%$'\r'}"
  dq='^"([^"]*)"' sq="^'([^']*)'"
  if [[ "$value" =~ $dq ]] || [[ "$value" =~ $sq ]]; then
    DATABASE_URL="${BASH_REMATCH[1]}"
  else
    DATABASE_URL="${value%%[[:space:]]#*}"
    DATABASE_URL="${DATABASE_URL%"${DATABASE_URL##*[![:space:]]}"}"
  fi
  unset line value
fi
if [[ -z "$DATABASE_URL" ]]; then
  echo "[backup] DATABASE_URL is empty in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
target="$BACKUP_DIR/chadgtm-$LABEL.dump"
tmp="$target.partial"
if [[ -e "$target" ]]; then
  echo "[backup] $target already exists; refusing to overwrite it (use another label)" >&2
  exit 1
fi
trap 'rm -f "$tmp"' EXIT

echo "[backup] dumping database to $target"
pg_dump --format=custom --compress=6 --file="$tmp" --dbname="$DATABASE_URL"
# A dump that pg_restore cannot list is not a backup.
pg_restore --list "$tmp" >/dev/null
# ln + rm instead of mv: fails instead of replacing a dump that appeared meanwhile.
ln "$tmp" "$target"
rm -f "$tmp"
trap - EXIT
echo "[backup] ok: $(du -h "$target" | cut -f1) $target"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'chadgtm-*.dump' -mtime +"$RETENTION_DAYS" ! -path "$target" -print -delete \
  | sed 's/^/[backup] removed old backup /'

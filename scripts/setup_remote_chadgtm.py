#!/usr/bin/env python3
"""One-time / idempotent preparation of the Oracle VM for AutoGTM.

    SERVER_HOST=<vm> python3 scripts/setup_remote_chadgtm.py [--install-backup-cron]

Env:
    SERVER_HOST   required
    SERVER_USER   default "ubuntu"
    SSH_KEY_PATH  default "~/.oci/smartreach_id_rsa"
    REPO_URL      default "https://github.com/krishcshah/chad-gtm.git" (only used to clone)

What it does on the VM (never touches /home/ubuntu/smart-reach):
  - clones the repo to /home/ubuntu/chad-gtm if it is not there yet;
  - creates apps/web/.env.local and packages/email-engine/.env from .env.example
    ONLY if they do not exist (mode 600) - it never overwrites or copies env files;
  - creates /home/ubuntu/backups (mode 700);
  - reports whether data/leads.db is present (ship it with scripts/stream_leads_db_to_vm.py);
  - with --install-backup-cron, adds the nightly scripts/backup-db.sh crontab line once.

It does not start or reload any process; deploy with scripts/deploy_remote_chadgtm.py.
"""
import os
import shlex
import subprocess
import sys

REMOTE = r'''
set -euo pipefail
APP_DIR=/home/ubuntu/chad-gtm
if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> cloning $REPO_URL into $APP_DIR"
  git clone --branch main "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

umask 077
if [ -e apps/web/.env.local ]; then
  echo "==> apps/web/.env.local exists; left unchanged"
else
  cp .env.example apps/web/.env.local
  echo "==> created apps/web/.env.local from .env.example: FILL IT IN before deploying (docs/OPERATIONS.md)"
fi
# The engine loads its own .env first and apps/web/.env.local second; dotenv never
# overrides, so even an empty KEY= here would hide the web value. Start it empty.
if [ -e packages/email-engine/.env ]; then
  echo "==> packages/email-engine/.env exists; left unchanged"
else
  printf '%s\n' '# Engine-only overrides. Everything else comes from apps/web/.env.local.' \
    '# Do not add empty KEY= lines: they hide the web value.' > packages/email-engine/.env
  echo "==> created an empty packages/email-engine/.env (engine falls back to apps/web/.env.local)"
fi
chmod 600 apps/web/.env.local packages/email-engine/.env

mkdir -p /home/ubuntu/backups
chmod 700 /home/ubuntu/backups
echo "==> backups directory: /home/ubuntu/backups"

if [ -s data/leads.db ]; then
  echo "==> data/leads.db present ($(du -h data/leads.db | cut -f1))"
else
  echo "!! data/leads.db missing: copy it with scripts/stream_leads_db_to_vm.py, then run npm run leads:index"
fi

node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)' \
  && echo "==> node $(node -v) ok" || echo "!! node $(node -v 2>/dev/null || echo missing): need >= 22.13"
# Production Postgres is 17.x: pg_dump/pg_restore must be >= 17.
if command -v pg_dump >/dev/null; then
  pgv="$(pg_dump --version | awk '{print $3}')"
  if [ "${pgv%%.*}" -ge 17 ] 2>/dev/null; then
    echo "==> pg_dump $pgv ok"
  else
    echo "!! pg_dump $pgv is too old for the Postgres 17 server: install postgresql-client-17 (PGDG apt repo)"
  fi
else
  echo "!! pg_dump missing: install postgresql-client-17 (PGDG apt repo)"
fi

if [ "$INSTALL_CRON" = "1" ]; then
  line='17 3 * * * cd /home/ubuntu/chad-gtm && bash scripts/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1'
  if crontab -l 2>/dev/null | grep -Fq 'scripts/backup-db.sh'; then
    echo "==> backup cron already installed"
  else
    ( crontab -l 2>/dev/null || true; echo "$line" ) | crontab -
    echo "==> installed nightly backup cron: $line"
  fi
fi

echo "==> done. Next: fill env files, set up pm2 startup + pm2-logrotate (docs/OPERATIONS.md), then deploy."
'''


def main() -> int:
    host = os.environ.get('SERVER_HOST', '').strip()
    if not host:
        print('SERVER_HOST is not set', file=sys.stderr)
        return 2
    user = os.environ.get('SERVER_USER', 'ubuntu').strip() or 'ubuntu'
    key = os.path.expanduser(os.environ.get('SSH_KEY_PATH', '~/.oci/smartreach_id_rsa'))
    repo_url = os.environ.get('REPO_URL', 'https://github.com/krishcshah/chad-gtm.git')
    install_cron = '1' if '--install-backup-cron' in sys.argv[1:] else '0'

    prelude = f'REPO_URL={shlex.quote(repo_url)}\nINSTALL_CRON={install_cron}\n'
    cmd = [
        'ssh',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'BatchMode=yes',
        '-i', key,
        f'{user}@{host}',
        'bash -s',
    ]
    res = subprocess.run(cmd, input=(prelude + REMOTE).replace('\r', '').encode('utf-8'))
    return res.returncode


if __name__ == '__main__':
    sys.exit(main())

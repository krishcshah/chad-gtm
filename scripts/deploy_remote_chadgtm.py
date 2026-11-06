#!/usr/bin/env python3
"""Manual deploy of AutoGTM to the Oracle VM.

Runs the same steps as .github/workflows/deploy.yml: take the shared deploy
lock, fast-forward /home/ubuntu/chad-gtm to origin/main, then
scripts/deploy-remote.sh (npm ci -> pg_dump -> db:migrate -> build ->
pm2 reload chadgtm-web/chadgtm-worker -> health check).

Usage:
    SERVER_HOST=<vm ip or name> python3 scripts/deploy_remote_chadgtm.py

Env:
    SERVER_HOST   required
    SERVER_USER   default "ubuntu"
    SSH_KEY_PATH  default "~/.oci/smartreach_id_rsa"

Pushes nothing: it deploys whatever is on origin/main. No secrets live here.
"""
import os
import subprocess
import sys

# Keep this block identical to the `script:` block in .github/workflows/deploy.yml.
BOOTSTRAP = r'''
set -euo pipefail
APP_DIR=/home/ubuntu/chad-gtm
LOCK_FILE=/home/ubuntu/.openoutreach-deploy.lock
# Same lock as SmartReach's deploy, so two builds never run at once on the VM.
exec 9>>"$LOCK_FILE"
echo "==> waiting for deploy lock $LOCK_FILE"
flock -w 1800 9 || { echo "!! could not get the deploy lock within 30 minutes" >&2; exit 1; }
export DEPLOY_LOCK_HELD=1
cd "$APP_DIR"
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "main" ] || { echo "!! $APP_DIR is on branch $branch, expected main" >&2; exit 1; }
# Old deploys ran npm install, which rewrote the lockfile; drop that drift.
git checkout -- package-lock.json 2>/dev/null || true
PREVIOUS_SHA="$(git rev-parse --short=12 HEAD)"
export PREVIOUS_SHA
# data/leads.db.gz is no longer tracked, so the pull deletes it: unpack it first if it is the only copy.
if [ ! -s data/leads.db ] && [ -s data/leads.db.gz ]; then gunzip -k data/leads.db.gz; fi
git pull --ff-only origin main
exec bash scripts/deploy-remote.sh
'''


def main() -> int:
    host = os.environ.get('SERVER_HOST', '').strip()
    if not host:
        print('SERVER_HOST is not set (e.g. SERVER_HOST=1.2.3.4 python3 scripts/deploy_remote_chadgtm.py)', file=sys.stderr)
        return 2
    user = os.environ.get('SERVER_USER', 'ubuntu').strip() or 'ubuntu'
    key = os.path.expanduser(os.environ.get('SSH_KEY_PATH', '~/.oci/smartreach_id_rsa'))
    if not os.path.isfile(key):
        print(f'SSH key not found: {key} (set SSH_KEY_PATH)', file=sys.stderr)
        return 2

    cmd = [
        'ssh',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'BatchMode=yes',
        '-o', 'ServerAliveInterval=30',
        '-i', key,
        f'{user}@{host}',
        'bash -s',
    ]
    print(f'Deploying origin/main to {user}@{host}:/home/ubuntu/chad-gtm ...', flush=True)
    # Output streams straight to this terminal so progress and pm2 logs are visible.
    res = subprocess.run(cmd, input=BOOTSTRAP.replace('\r', '').encode('utf-8'))
    if res.returncode == 0:
        print('Deploy finished.')
    else:
        print(f'Deploy FAILED (exit {res.returncode}). See the output above and docs/OPERATIONS.md.', file=sys.stderr)
    return res.returncode


if __name__ == '__main__':
    sys.exit(main())

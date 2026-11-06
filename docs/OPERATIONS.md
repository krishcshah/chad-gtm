# Operations runbook

How AutoGTM runs in production: deploy, rollback, backup and restore, monitoring,
secret rotation, and every environment variable.

## Production layout

| What | Where |
|---|---|
| Host | Oracle Cloud VM (Always Free), user `ubuntu` |
| Checkout | `/home/ubuntu/chad-gtm` (branch `main`) |
| Web | PM2 `chadgtm-web`: `npx next start -p 3005`, cwd `apps/web` |
| Engine | PM2 `chadgtm-worker`: `npm run worker`, cwd `packages/email-engine` (scheduler, SMTP, IMAP sync, reply agent) |
| Database | Postgres database `chadgtm` on `127.0.0.1` |
| Env files | `apps/web/.env.local` (everything) and `packages/email-engine/.env` (engine-only overrides; see [Environment variables](#environment-variables)) |
| Lead directory | `data/leads.db` (SQLite, not in git) |
| TLS / proxy | Caddy, public origin `https://autogtm.tech` |
| Backups | `/home/ubuntu/backups` |
| Deploy lock | `/home/ubuntu/.openoutreach-deploy.lock` (shared with SmartReach so two builds never run at once) |

SmartReach also runs on this VM from `/home/ubuntu/smart-reach` with its own
database and PM2 processes. Nothing in this repo may touch it: no `pm2 reload all`,
no `pm2 restart all`, and no commands in that directory.

## Deploy

### Automatic (push to `main`)

`.github/workflows/deploy.yml` runs on every push to `main` (and on demand from
the Actions tab). Runs queue one after another (`concurrency: deploy-production`).
It connects over SSH and:

1. takes the deploy lock (`flock`, waits up to 30 min);
2. checks the checkout is on `main`, discards local `package-lock.json` drift,
   and runs `git pull --ff-only origin main`;
3. runs `scripts/deploy-remote.sh` from the freshly pulled code, which does:
   - preflight: Node >= 22.13, `apps/web/.env.local` exists, `data/leads.db` exists;
   - `npm ci`;
   - `scripts/backup-db.sh predeploy-<sha>` → `/home/ubuntu/backups/chadgtm-predeploy-<sha>.dump`;
   - `npm run db:migrate`;
   - `npm run build --workspace @smartreach/web`;
   - `pm2 reload chadgtm-web --update-env` and `pm2 reload chadgtm-worker --update-env`
     (or `pm2 start` the first time);
   - health check: `curl http://127.0.0.1:3005/api/health` up to 30 times, 3 s apart;
   - checks `chadgtm-worker` is not crash-looping (restart count stable for 20 s);
   - `pm2 save`.

On any failure it prints the failing step, the last 80 lines of both PM2 logs
(once the processes were reloaded), the previous commit and the backup path,
and the workflow fails.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SERVER_HOST` | VM address |
| `SERVER_USER` | `ubuntu` |
| `SSH_PRIVATE_KEY` | a dedicated deploy key whose public half is in `~/.ssh/authorized_keys` on the VM |
| `SERVER_FINGERPRINT` | optional, recommended: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VM (the `SHA256:...` part) |

Known limitation: the web build runs in place in `apps/web/.next` while the old
server keeps serving, so pages can error for the minute or two the build takes,
and a failed build leaves the site degraded until the next good deploy or a
rollback. `npm ci` also replaces `node_modules` under the running processes.

### Manual

```bash
SERVER_HOST=<vm address> python3 scripts/deploy_remote_chadgtm.py
# optional: SERVER_USER=ubuntu SSH_KEY_PATH=~/.oci/smartreach_id_rsa
```

Same steps as the workflow (same bootstrap block, then `scripts/deploy-remote.sh`).
It deploys whatever is on `origin/main`; it does not push. New host keys are
accepted on first use and checked afterwards (`StrictHostKeyChecking=accept-new`).

On the VM itself you can run the server-side steps directly; the script takes
the lock when run by hand:

```bash
cd /home/ubuntu/chad-gtm && git pull --ff-only origin main && bash scripts/deploy-remote.sh
```

### First-time VM setup

```bash
SERVER_HOST=<vm address> python3 scripts/setup_remote_chadgtm.py --install-backup-cron
```

Idempotent. Clones the repo if missing, creates `apps/web/.env.local` from
`.env.example` and an empty `packages/email-engine/.env` only if they do not
exist (it never overwrites or copies env files), creates `/home/ubuntu/backups`,
reports Node / `pg_dump` (must be >= 17, the server is Postgres 17.x) / `data/leads.db`, and optionally installs the nightly
backup cron. Then do [PM2 setup](#pm2-startup-and-log-rotation) once.

## Rollback

The deploy log prints the previous commit (`previous <sha>`) and the backup file.

**Code only** (the usual case; migrations are additive):

```bash
cd /home/ubuntu/chad-gtm
exec 9>>/home/ubuntu/.openoutreach-deploy.lock && flock 9
git reset --hard <previous sha>
npm ci && npm run build --workspace @smartreach/web
pm2 reload chadgtm-web --update-env && pm2 reload chadgtm-worker --update-env
curl -fsS http://127.0.0.1:3005/api/health
exit   # releases the lock
```

Then revert the bad commit on `main` (`git revert`), otherwise the next push
deploys it again. Drizzle has no down migrations; if a migration itself broke
data, restore the database too.

**Database** — see [Restore a backup](#restore-a-backup).

## Backups

Production Postgres is **17.x**, so `pg_dump`/`pg_restore` on the VM must be
**17 or newer** (a 16 client refuses to dump a 17 server, and Ubuntu's default
`postgresql-client` is older). Install `postgresql-client-17` from the PGDG apt
repository (apt.postgresql.org). `backup-db.sh` refuses to run with an older
`pg_dump` (override the minimum with `PG_MIN_MAJOR` only if the server changes),
and the setup script reports the version.

`scripts/backup-db.sh` runs `pg_dump --format=custom`, checks the result with
`pg_restore --list`, writes atomically to `/home/ubuntu/backups` (mode 700/600)
and deletes `chadgtm-*.dump` files older than 7 days. It reads `DATABASE_URL`
from `apps/web/.env.local` and never prints it.

```bash
bash scripts/backup-db.sh                 # chadgtm-<UTC timestamp>.dump
bash scripts/backup-db.sh before-rotation # chadgtm-before-rotation.dump
# env: BACKUP_DIR (default ~/backups), RETENTION_DAYS (default 7), ENV_FILE, DATABASE_URL
```

Every deploy writes `chadgtm-predeploy-<sha>.dump` first.

Nightly cron (installed by `setup_remote_chadgtm.py --install-backup-cron`, or `crontab -e`):

```cron
17 3 * * * cd /home/ubuntu/chad-gtm && bash scripts/backup-db.sh >> /home/ubuntu/backups/backup.log 2>&1
```

Backups on the same VM do not survive losing the VM. Copy them off-box, for
example nightly to OCI Object Storage (`oci os object put --bucket-name <bucket> --file <dump>`)
or `rsync` to another machine, and keep a copy of `data/leads.db` off-box too.
Test a restore into a scratch database at least once.

### Restore a backup

Stop both processes so nothing writes during the restore, and load the URL
without echoing it:

```bash
cd /home/ubuntu/chad-gtm
pm2 stop chadgtm-worker && pm2 stop chadgtm-web
set -a; . <(grep -E '^DATABASE_URL=' apps/web/.env.local); set +a
DUMP=/home/ubuntu/backups/chadgtm-predeploy-<sha>.dump
```

Full restore (recommended; keeps the broken database for inspection). Needs the
Postgres superuser; `<db_user>` is the user in `DATABASE_URL`:

```bash
sudo -u postgres psql -c "ALTER DATABASE chadgtm RENAME TO chadgtm_broken_$(date +%Y%m%d%H%M)"
sudo -u postgres createdb -O <db_user> chadgtm
pg_restore --no-owner --exit-on-error --dbname="$DATABASE_URL" "$DUMP"
```

In-place restore (no superuser; tables created after the dump stay behind):

```bash
pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error --dbname="$DATABASE_URL" "$DUMP"
```

Then roll the code back to the commit that matches the dump (see
[Rollback](#rollback)) and start the processes again:

```bash
pm2 start chadgtm-web && pm2 start chadgtm-worker
curl -fsS http://127.0.0.1:3005/api/health
```

## Lead directory

`data/leads.db` is personal data (names, emails, phones). It is **not** in git
anymore (`.gitignore` excludes `data/*.db`, `data/*.gz`, `data/*.csv`). The old
`data/leads.db.gz` is still in the repository history until the owner purges it
(`git filter-repo --path data/leads.db.gz --invert-paths`, force-push, and ask
GitHub Support to drop cached views); making the repository private is the
quick fix.

Copy the file to the VM out of band, then build the indexes once:

```bash
rsync -avP --partial data/leads.db ubuntu@<vm>:/home/ubuntu/chad-gtm/data/leads.db.new
ssh ubuntu@<vm> 'cd /home/ubuntu/chad-gtm/data && mv leads.db.new leads.db && cd .. && npm run leads:index -- --db data/leads.db'
# or: scripts/stream_leads_db_to_vm.py (gzip stream over ssh)
```

The first deploy after this change deletes the server's tracked
`data/leads.db.gz` (git removes files that are no longer tracked); the deploy
unpacks it first if `data/leads.db` does not exist yet, and refuses to deploy
when `data/leads.db` is missing.

## PM2 startup and log rotation

Once per VM:

```bash
pm2 startup systemd -u ubuntu --hp /home/ubuntu   # then run the sudo line it prints
pm2 save                                          # the deploy also saves after each run
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

pm2-logrotate is a daemon-wide module, so it also rotates SmartReach's PM2 logs
(it does not restart any process). Reboot once and check that `chadgtm-web` and
`chadgtm-worker` come back (`pm2 status`). Watch disk space (`df -h`);
`data/leads.db`, backups and logs are the big items.

## Monitoring

`GET /api/health` (no auth, no secrets, no user or mailbox data):

```json
{ "ok": true, "db": true, "engine": { "lastTickAt": "2026-11-06T12:00:00.000Z", "ageSeconds": 12, "stale": false } }
```

| Request | 200 | 503 |
|---|---|---|
| `/api/health` | database answers | database down or not configured |
| `/api/health?strict=1` | database answers **and** the engine ticked in the last 10 min | otherwise |

`engine.lastTickAt` is the newest `engine_heartbeats.last_tick_at`, written by
the worker every tick. Until the worker writes heartbeats (migration 0013 plus
the engine change), `stale` is `true` and strict mode returns 503.

Set up an external uptime monitor (UptimeRobot, Better Stack, ...), with email
or phone alerts:

- HTTP monitor on `https://autogtm.tech/api/health?strict=1`, every 5 min, alert on any non-200;
- HTTP monitor on `https://autogtm.tech/login`.

Logs: `pm2 logs chadgtm-web --lines 200`, `pm2 logs chadgtm-worker --lines 200`.

## Secret rotation

Production secrets (database password, `ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`,
a mailbox password) were committed to the public repository history. Removing
them from `HEAD` does not help; rotate them. Order:

0. **Backup:** `bash scripts/backup-db.sh before-rotation`.
1. **Close Postgres to the internet.** `listen_addresses = 'localhost'` in
   `postgresql.conf` (or `pg_hba.conf` rules for `127.0.0.1/32` only), remove
   5432 from the OCI security list and from `ufw`/`iptables`, restart Postgres,
   and check from outside that 5432 is closed. Look in the Postgres logs for
   unknown client IPs.
2. **Database password.** `sudo -u postgres psql`, then `\password <db_user>`
   (keeps it out of shell history). Update `DATABASE_URL` in
   `apps/web/.env.local` (and in `packages/email-engine/.env` if it is set
   there), then `pm2 reload chadgtm-web --update-env && pm2 reload chadgtm-worker --update-env`.
   SmartReach's own leaked database user must be rotated in SmartReach's own
   deployment, not from here.
3. **`BETTER_AUTH_SECRET`.** Generate
   (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`),
   set the same value in both env files, and set `UNSUBSCRIBE_SECRET_PREVIOUS`
   to the **old** `BETTER_AUTH_SECRET` value in both env files, then reload both
   processes (`--update-env`). Effects:
   - everyone is logged out (sessions and the 5-minute cookie cache are signed with it);
   - unsubscribe links in emails **already sent** keep working: tokens are
     HMACs over this secret, and verification also accepts a signature made
     with `UNSUBSCRIBE_SECRET_PREVIOUS`. New links are signed with the new
     secret only. Remove `UNSUBSCRIBE_SECRET_PREVIOUS` after a year (tokens
     expire after 365 days). Without it, old links fail and people who cannot
     unsubscribe must be added to the blocklist by hand.
   It must still be rotated: with the leaked value anyone can forge a session
   cookie for any user, including admins. `UNSUBSCRIBE_SECRET_PREVIOUS` only
   verifies unsubscribe tokens (the worst a forger can do with it is
   unsubscribe an address); it is never used for sessions.
4. **`ENCRYPTION_KEY`.** Never just change it: every stored SMTP/IMAP password
   and AI key would become unreadable. Use the re-encryption script:

   ```bash
   cd /home/ubuntu/chad-gtm
   pm2 stop chadgtm-worker
   export OLD_ENCRYPTION_KEY="$(grep -E '^ENCRYPTION_KEY=' apps/web/.env.local | tail -1 | cut -d= -f2- | tr -d '"'"'")"
   export NEW_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
   npx tsx scripts/rotate-encryption-key.ts            # dry run: counts + decrypt check, no writes
   npx tsx scripts/rotate-encryption-key.ts --apply    # one transaction
   sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=\"$NEW_ENCRYPTION_KEY\"|" apps/web/.env.local
   # same for packages/email-engine/.env if it sets ENCRYPTION_KEY (better: delete it there)
   pm2 reload chadgtm-web --update-env && pm2 restart chadgtm-worker --update-env
   npx tsx scripts/rotate-encryption-key.ts --apply    # catches anything saved with the old key meanwhile
   unset OLD_ENCRYPTION_KEY NEW_ENCRYPTION_KEY
   ```

   The script re-encrypts `sender_accounts.smtp_password_enc`,
   `sender_accounts.imap_password_enc` and `workspace_settings.ai_api_key_enc`
   (every `encryptSecret()` call site). It refuses to write if any value does
   not decrypt with the old key. Values that were never encrypted (for example
   the demo account's placeholder passwords) also block it; pass
   `--leave-malformed` to keep those as they are. Values already under the new
   key are skipped, so re-running is safe. Then check `pm2 logs chadgtm-worker`
   for decrypt errors.
5. **Mailbox passwords.** Change the leaked mailbox password at the mail
   provider and update the mailbox in Admin → pool mailboxes.
6. **`CRON_SECRET`.** Set one if it is not set (`/api/engine/tick` is disabled
   in production without it).
7. **Admin and demo passwords.** Change the admin password from the app. Delete
   the demo account or reseed it with a new `SEED_DEMO_PASSWORD`.

## Seed scripts

Both refuse to run without `DATABASE_URL` and a password of at least 12
characters from the environment, and never print it:

```bash
DATABASE_URL=... SEED_ADMIN_PASSWORD=... node scripts/seed-admin-account.cjs   # optional SEED_ADMIN_EMAIL
DATABASE_URL=... SEED_DEMO_PASSWORD=...  node scripts/seed-demo-account.cjs
```

The admin seed creates the account with `role = 'admin'` and approves it; it
never changes the password, role or approval of an existing account. The demo
seed deletes and recreates the demo account's data.

## Environment variables

Put everything in `apps/web/.env.local`. The engine loads
`packages/email-engine/.env` first, then `apps/web/.env.local`, then the root
`.env`, and never overrides a value it already has, so an engine `.env` should
hold only engine-specific overrides. An empty `KEY=` line in it **hides** the web
value. `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` must be the same for both
processes. After editing, `pm2 reload <app> --update-env`.

Web = `chadgtm-web`, Engine = `chadgtm-worker`.

| Variable | Used by | Required | Default | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | both, migrate, scripts | yes | – | Postgres URL |
| `BETTER_AUTH_SECRET` | both | yes (≥16 chars, use 32+) | – | Sessions; unsubscribe HMAC (falls back to `ENCRYPTION_KEY`). See rotation |
| `UNSUBSCRIBE_SECRET_PREVIOUS` | both | no | – | Previous `BETTER_AUTH_SECRET` after a rotation; unsubscribe links signed with it still verify. Never used to sign. See rotation |
| `ENCRYPTION_KEY` | both | yes | – | 64 hex chars (web rejects anything else in production). Rotate only with `scripts/rotate-encryption-key.ts` |
| `APP_URL` | both | yes | `http://localhost:3000` (web) | Public https origin, e.g. `https://autogtm.tech`. Engine uses it for tracking, unsubscribe and "Needs you" links |
| `BETTER_AUTH_URL` | web (engine falls back to it for links) | yes | `http://localhost:3000` | Usually equal to `APP_URL` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | web | no | – | Extra sign-in origins, comma-separated (e.g. the old sslip.io host) |
| `NEXT_PUBLIC_APP_URL` | web (browser), engine fallback | no | `BETTER_AUTH_URL` | Inlined at build time |
| `CRON_SECRET` | web | yes in production | – | Bearer token for `/api/engine/tick`; route is disabled in production without it |
| `ADMIN_EMAILS` | web | recommended | – | Comma-separated admin emails |
| `ADMIN_EMAIL` | web | no | – | Legacy single admin email |
| `SIGNUP_APPROVAL_REQUIRED` | both | no | `true` | `false` lets new accounts send without admin approval. The engine also re-checks it every tick: campaigns of owners who are not approved (approval revoked) are skipped (`owner-not-approved`) |
| `GEMINI_API_KEY` | both | recommended | – | Research, per-lead copy, reply triage. Without any key, heuristics are used |
| `GOOGLE_API_KEY` | both | no | – | Alias for `GEMINI_API_KEY` |
| `OPENAI_API_KEY` | both | no | – | Used when a workspace selects OpenAI |
| `AGENT_RUNTIME_ENABLED` | web | no | `true` | `false` = legacy analysis path without agent traces |
| `AUTOPILOT_COUNTRIES` | autopilot | no | `United States` | Comma-separated target countries |
| `AUTOPILOT_TIMEZONE` | autopilot | no | `America/New_York` | Send-window time zone |
| `SYSTEM_SMTP_HOST` | system mail | for notifications | – | Dedicated SMTP for platform mail ("Needs you", approvals) |
| `SYSTEM_SMTP_PORT` | system mail | no | `587` | |
| `SYSTEM_SMTP_SECURE` | system mail | no | `false` | `true` = implicit TLS (465). Certificates are always verified |
| `SYSTEM_SMTP_USER` | system mail | with host | – | |
| `SYSTEM_SMTP_PASS` | system mail | with host | – | Secret |
| `SYSTEM_EMAIL_FROM` | system mail | with host | – | e.g. `AutoGTM <notify@autogtm.tech>` |
| `ENGINE_DRY_RUN` | both | no | unset = **live** | `1`/`true` = dry-run queue, nothing is sent. Web and engine must agree. Set it in local dev |
| `ENGINE_INTERVAL_MS` | engine | no | `30000` | Scheduler tick |
| `ENGINE_SYNC_MS` | engine | no | `120000` | IMAP reply sync |
| `ENGINE_BATCH_SIZE` | engine | no | `25` | Emails per tick |
| `SMTP_ALLOW_SELF_SIGNED` | engine | no | `false` | Accept self-signed SMTP certificates. Fix the certificate instead |
| `PUPPETEER_EXECUTABLE_PATH` | web | for JS-heavy sites | auto-detect | Chromium path (`scripts/setup-oracle-browser.sh`) |
| `CHROME_PATH` | web | no | – | Alternative to the above |
| `PORT` | web | no | `3000` | PM2 passes `-p 3005` |
| `NODE_ENV` | web | – | set by `next start` | `production` enables strict env validation |
| `NEXT_DIST_DIR` | web build | no | `.next` | Only for `build:isolated` |

The `AUTOPILOT_*` and `SYSTEM_*` variables are read by the autopilot and
notification code; keep them in `apps/web/.env.local` so both processes see them.

Script and CI variables (not read by the app):

| Variable | Used by | Notes |
|---|---|---|
| `OLD_ENCRYPTION_KEY`, `NEW_ENCRYPTION_KEY` | `scripts/rotate-encryption-key.ts` | New key must be 64 hex |
| `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_EMAIL` | `scripts/seed-admin-account.cjs` | Password ≥ 12 chars |
| `SEED_DEMO_PASSWORD` | `scripts/seed-demo-account.cjs` | Password ≥ 12 chars |
| `BACKUP_DIR`, `RETENTION_DAYS`, `ENV_FILE` | `scripts/backup-db.sh` | Defaults `~/backups`, `7`, `apps/web/.env.local` |
| `HEALTH_ATTEMPTS`, `WEB_PORT`, `DEPLOY_LOCK_FILE` | `scripts/deploy-remote.sh` | Defaults `30`, `3005`, `/home/ubuntu/.openoutreach-deploy.lock` |
| `SERVER_HOST`, `SERVER_USER`, `SSH_KEY_PATH`, `REPO_URL` | `deploy_remote_chadgtm.py`, `setup_remote_chadgtm.py` | `SERVER_USER` default `ubuntu`, key default `~/.oci/smartreach_id_rsa` |
| `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, `SERVER_FINGERPRINT` | GitHub Actions secrets | See [Deploy](#deploy) |
| `E2E_MAILBOXES` | `scripts/e2e-reply-agent.ts` | Path to a mailbox JSON outside the repo |

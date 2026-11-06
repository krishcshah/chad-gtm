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

1. takes the deploy lock (`flock`, waits up to 10 min);
2. checks the checkout is on `main`, discards local `package-lock.json` drift,
   and runs `git fetch origin main`. The checkout is **not** moved yet;
3. extracts `scripts/deploy-remote.sh` and `scripts/check-deploy-env.mjs` from
   the fetched commit into a temporary directory and runs them, which does:
   - **preflight**, before anything changes: the fetched commit is a
     fast-forward of the checkout, no local changes to tracked files, Node >=
     22.13, `pg_dump` >= 17, `pm2`, `data/leads.db`, at least 1 GB free disk,
     and the [environment check](#deploy-environment-check) (web, worker and
     migrations all use the `chadgtm` database; web and worker share their
     secrets);
   - fast-forwards the checkout to the fetched commit;
   - `npm ci`, after keeping the current `node_modules` as `node_modules.prev`
     (hard links, so it costs little disk until the new install replaces files);
   - `scripts/backup-db.sh predeploy-<sha>-<UTC time>` →
     `/home/ubuntu/backups/chadgtm-predeploy-<sha>-<UTC time>.dump` (a new file
     every run; `backup-db.sh` never overwrites an existing dump);
   - `npm run db:migrate` with `PGOPTIONS='-c lock_timeout=15s'`, so a migration
     that would queue behind live app traffic fails instead of stalling the site;
   - `npm run build --workspace @smartreach/web`, after keeping the current
     `apps/web/.next` as `apps/web/.next.prev`;
   - `pm2 reload chadgtm-web --update-env` and `pm2 reload chadgtm-worker --update-env`
     (or `pm2 start` the first time);
   - health check: `curl http://127.0.0.1:3005/api/health` up to 30 times, 3 s apart;
   - checks `chadgtm-worker` is not crash-looping (restart count stable for 20 s);
   - `pm2 save`, **only** if a chadgtm process was started for the first time
     (see [PM2 setup](#pm2-startup-and-log-rotation));
   - records the commit in `.git/chadgtm-last-deployed` and deletes the `*.prev` copies.

Failures:

- **During preflight**: nothing on the server changed.
- **After the checkout moved but before the pm2 reload** (`npm ci`, backup,
  migrate, build): the script puts the previous commit (`git reset --hard`),
  `node_modules` and `apps/web/.next` back. The old processes keep running the
  old release, and a pm2 restart, `pm2 resurrect` or reboot starts the old
  release too. A migration that already committed stays applied (migrations
  are additive, so the old code runs on the newer schema); the backup path is
  printed.
- **After the pm2 reload** (health check, worker stability): the new release is
  live and is **not** rolled back automatically. The log names the last
  successfully deployed commit and the backup; `node_modules.prev` and
  `apps/web/.next.prev` are kept until the next deploy for a quick
  [rollback](#rollback).

The workflow log only shows step names, pm2 status and restart counts. The
repository is public, so application logs (which contain email addresses and
query parameters) are never printed there; read them on the VM with
`pm2 logs chadgtm-web --lines 200` / `pm2 logs chadgtm-worker --lines 200`.

Timing: the lock wait (10 min) plus a worst-case deploy (about 25 min,
mostly `npm ci` and `next build`) stays inside the action's
`command_timeout` (55 min) and the job's `timeout-minutes` (65). If a
SmartReach deploy holds the lock longer, the run fails at the lock, before
anything changed; re-run it.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SERVER_HOST` | VM address |
| `SERVER_USER` | `ubuntu` |
| `SSH_PRIVATE_KEY` | a dedicated deploy key whose public half is in `~/.ssh/authorized_keys` on the VM |
| `SERVER_FINGERPRINT` | optional, recommended: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` on the VM (the `SHA256:...` part) |

Known limitations: `npm ci` and the web build still run in place, under the
running processes. While `npm ci` runs, routes that load a package for the
first time can return 500, and while `next build` runs, pages can error for the
minute or two it takes. Both recover by themselves; a failure in either step
restores the old `node_modules` / `.next` (see above), so the site does not
stay down. The deploy needs free disk for the second copy of `node_modules`
and `.next` (`DEPLOY_MIN_FREE_MB`, default 1024).

### Manual

```bash
SERVER_HOST=<vm address> python3 scripts/deploy_remote_chadgtm.py
# optional: SERVER_USER=ubuntu SSH_KEY_PATH=~/.oci/smartreach_id_rsa
```

Same steps as the workflow (same bootstrap block, then `scripts/deploy-remote.sh`).
It deploys whatever is on `origin/main`; it does not push. New host keys are
accepted on first use and checked afterwards (`StrictHostKeyChecking=accept-new`).
Its output is the same as the workflow's (no application logs).

On the VM itself you can run the server-side steps directly; the script takes
the lock when run by hand. Do not `git pull` first: pass the commit instead, so
the preflight runs before the checkout moves:

```bash
cd /home/ubuntu/chad-gtm && git fetch origin main && TARGET_SHA="$(git rev-parse FETCH_HEAD)" bash scripts/deploy-remote.sh
```

(This runs the `deploy-remote.sh` of the current checkout; the workflow and
`deploy_remote_chadgtm.py` run the one from the commit being deployed.)

### Deploy environment check

`scripts/check-deploy-env.mjs` resolves the environment the way each process
does (dotenv never overrides, so the first source that defines a key wins):

| Process | Order |
|---|---|
| web (`next start`, cwd `apps/web`) | deploy shell env, pm2's stored env, `apps/web/.env.production.local`, `apps/web/.env.local`, `apps/web/.env.production`, `apps/web/.env` |
| worker (`load-env.ts`) | deploy shell env, pm2's stored env, `packages/email-engine/.env`, `apps/web/.env.local`, `.env` |
| migrate / `backup-db.sh` | deploy shell env, `apps/web/.env.local`, `.env`, `.env.production.local` |

It refuses to deploy unless `DATABASE_URL` resolves to the same host, port and
database for all three and the database is `chadgtm` (`DEPLOY_DB_NAME`), and
`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` and `APP_URL` are set and identical for
web and worker. It prints key names, file names and database names only, never
values or hosts. Run it by hand on the VM:

```bash
cd /home/ubuntu/chad-gtm && pm2 jlist | node scripts/check-deploy-env.mjs --app-dir . --pm2-jlist -
```

The VM's `packages/email-engine/.env` was originally copied from SmartReach
(including SmartReach's `DATABASE_URL` and an sslip.io `APP_URL`). If the check
fails on it, delete every line in that file that is not an engine-only
override, so the worker falls back to `apps/web/.env.local`.

### Migrations during a deploy

`npm run db:migrate` applies all pending migrations in one transaction while
`chadgtm-web` and `chadgtm-worker` keep running. `ALTER TABLE` takes a
table-wide lock even when the column already exists, and the locks are held
until the transaction commits. The deploy therefore sets
`lock_timeout` (`MIGRATE_LOCK_TIMEOUT`, default `15s`): if a migration cannot
get a lock in time it fails, nothing is committed, the deploy restores the
previous release, and you re-run it when traffic is low.

Migration `0012` adds each foreign key only if no foreign key with the same
column, referenced table and column and `ON DELETE` / `ON UPDATE` action
already exists, whatever its name. Databases built by the old runtime
self-heal have such keys under auto-generated `*_fkey` names, so they no longer
get a second copy (and a second full-table validation). A database that ran
the earlier version of `0012` (local dev only) may have duplicates; list them
read-only with:

```sql
SELECT conrelid::regclass AS tbl, array_agg(conname ORDER BY conname) AS fks
FROM pg_constraint WHERE contype = 'f'
GROUP BY conrelid, conkey, confrelid, confkey, confdeltype, confupdtype
HAVING count(*) > 1;
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

A failure before the pm2 reload rolls back by itself (see [Deploy](#deploy)).
After a failure past the reload, the deploy log prints the last successfully
deployed commit (also in `/home/ubuntu/chad-gtm/.git/chadgtm-last-deployed`)
and the backup file. Use that commit, not the one that was checked out when the
failed run started: a re-run of a failed deploy starts from the failed commit.

**Code only** (the usual case; migrations are additive):

```bash
cd /home/ubuntu/chad-gtm
exec 9>>/home/ubuntu/.openoutreach-deploy.lock && flock 9
git reset --hard <last deployed sha>
# Quick path, when node_modules.prev and apps/web/.next.prev are still there and
# belong to that commit (the failed deploy started from it):
#   rm -rf node_modules && mv node_modules.prev node_modules   (same for apps/*/ and packages/*/node_modules.prev)
#   rm -rf apps/web/.next && mv apps/web/.next.prev apps/web/.next
# Otherwise:
npm ci && npm run build --workspace @smartreach/web
pm2 reload chadgtm-web --update-env && pm2 reload chadgtm-worker --update-env
curl -fsS http://127.0.0.1:3005/api/health
git rev-parse HEAD > .git/chadgtm-last-deployed
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
`pg_restore --list`, writes atomically to `/home/ubuntu/backups` (mode 700/600),
refuses to overwrite an existing dump, and deletes `chadgtm-*.dump` files older
than 7 days. It reads `DATABASE_URL`
from `apps/web/.env.local` and never prints it.

```bash
bash scripts/backup-db.sh                 # chadgtm-<UTC timestamp>.dump
bash scripts/backup-db.sh before-rotation # chadgtm-before-rotation.dump
# env: BACKUP_DIR (default ~/backups), RETENTION_DAYS (default 7), ENV_FILE, DATABASE_URL
```

Every deploy writes `chadgtm-predeploy-<sha>-<UTC time>.dump` before migrating;
re-running the deploy of the same commit writes a new file, so the dump taken
before the first (failed) attempt's migrations is kept.

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
DUMP=/home/ubuntu/backups/chadgtm-predeploy-<sha>-<UTC time>.dump
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
pm2 save                                          # check `pm2 status` first, see below
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

The PM2 daemon is shared with SmartReach, and `pm2 save` writes the whole
daemon's process list (`~/.pm2/dump.pm2`, what `pm2 resurrect` and a reboot
restore), SmartReach's processes included. So the deploy does **not** run
`pm2 save` after a plain reload (a reload does not change what is resurrected);
it only saves when it had to `pm2 start` a chadgtm process for the first time.
Whenever you save by hand, or before that first deploy, check `pm2 status` so
you do not persist a stopped, errored or temporary SmartReach process.

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
   set the same value in `apps/web/.env.local` (and in
   `packages/email-engine/.env` only if it is set there), then reload both
   processes (`--update-env`). **Do not** set `UNSUBSCRIBE_SECRET_PREVIOUS` to
   the old value. Effects:
   - everyone is logged out (sessions and the 5-minute cookie cache are signed with it);
   - unsubscribe links in emails sent **before** the rotation stop verifying.
     This is deliberate. The old secret is public in the repository history,
     so accepting it as `UNSUBSCRIBE_SECRET_PREVIOUS` would let anyone mint an
     unsubscribe token for any address with any expiry, and each forged token
     adds a global suppression (all clients) and cancels every pending email
     to that address. Production has only sent test emails, so no real
     recipient holds an old link. If someone still reports a broken
     unsubscribe link, add the address to the blocklist by hand.
   It must be rotated: with the leaked value anyone can forge a session cookie
   for any user, including admins. `UNSUBSCRIBE_SECRET_PREVIOUS` is only for a
   later, routine rotation of a secret that was **never** exposed; never put a
   leaked value in it.
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
| `UNSUBSCRIBE_SECRET_PREVIOUS` | both | no | – | Previous `BETTER_AUTH_SECRET` after a routine rotation; unsubscribe links signed with it still verify (anyone who knows it can forge opt-outs). Never used to sign. **Never set it to a leaked secret**, including the pre-rotation value from the repository history. See rotation |
| `ENCRYPTION_KEY` | both | yes | – | 64 hex chars (web rejects anything else in production). Rotate only with `scripts/rotate-encryption-key.ts` |
| `APP_URL` | both | yes | `http://localhost:3000` (web) | Public https origin, e.g. `https://autogtm.tech`. Engine uses it for tracking, unsubscribe and "Needs you" links |
| `BETTER_AUTH_URL` | web (engine falls back to it for links) | yes | `http://localhost:3000` | Usually equal to `APP_URL` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | web | no | – | Extra sign-in origins, comma-separated (e.g. the old sslip.io host) |
| `NEXT_PUBLIC_APP_URL` | web (browser), engine fallback | no | `BETTER_AUTH_URL` | Inlined at build time |
| `CRON_SECRET` | web | yes in production | – | Bearer token for `/api/engine/tick`; route is disabled in production without it |
| `ADMIN_EMAILS` | web | no | – | Comma-separated emails that are admins **once the address is verified**. The main mechanism is `users.role = 'admin'` |
| `ADMIN_EMAIL` | – | – | – | Alias appended to `ADMIN_EMAILS`, same rule: grants admin only to a **verified** email. Without `SYSTEM_SMTP_*` no email is ever verified, so grant the first admin with `DATABASE_URL=... npx tsx scripts/make-admin.ts --email you@company.com [--dry-run]` (sets `users.role = 'admin'` and approves the account) |
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
| `ENGINE_INTERVAL_MS` | engine | no | `30000` | Scheduler tick. IMAP reply sync runs every 4th tick (every 2 min at the default); to poll IMAP less often, raise this. `ENGINE_SYNC_MS` is no longer read |
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
| `HEALTH_ATTEMPTS`, `HEALTH_INTERVAL_S`, `STABILITY_WAIT_S`, `WEB_PORT`, `DEPLOY_LOCK_FILE` | `scripts/deploy-remote.sh` | Defaults `30`, `3`, `20`, `3005`, `/home/ubuntu/.openoutreach-deploy.lock` |
| `DEPLOY_DB_NAME`, `DEPLOY_MIN_FREE_MB`, `MIGRATE_LOCK_TIMEOUT`, `DEPLOY_STATE_FILE` | `scripts/deploy-remote.sh` | Defaults `chadgtm`, `1024`, `15s`, `.git/chadgtm-last-deployed` |
| `TARGET_SHA`, `DEPLOY_SCRIPTS_DIR`, `APP_DIR` | `scripts/deploy-remote.sh` | Set by the deploy bootstrap: commit to deploy, where the extracted helper scripts are, the checkout |
| `SERVER_HOST`, `SERVER_USER`, `SSH_KEY_PATH`, `REPO_URL` | `deploy_remote_chadgtm.py`, `setup_remote_chadgtm.py` | `SERVER_USER` default `ubuntu`, key default `~/.oci/smartreach_id_rsa` |
| `SERVER_HOST`, `SERVER_USER`, `SSH_PRIVATE_KEY`, `SERVER_FINGERPRINT` | GitHub Actions secrets | See [Deploy](#deploy) |
| `E2E_MAILBOXES` | `scripts/e2e-reply-agent.ts` | Path to a mailbox JSON outside the repo |

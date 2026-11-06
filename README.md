<div align="center">

# AutoGTM

**Your website in. Meetings out.**

A client pastes their URL. AutoGTM researches the business, picks verified buyers from a shared B2B directory, sends a three-step sequence from a managed pool of warmed mailboxes, answers every reply, and sends interested leads to the client's calendar. The client only hears from AutoGTM when a lead needs something the agent doesn't have yet.

</div>

---

## How it works

```
URL ──▶ research (crawl + strategy) ──▶ ICP-matched leads ──▶ 3-step sequence
                                                                  │
         pooled mailboxes (30/day each, 45–120s jitter) ◀─────────┘
                                │
              IMAP sync ──▶ reply agent ──┬─▶ reply: booking link / known resource / known answer
                                          ├─▶ escalate: "Needs you" + email to the client
                                          └─▶ skip: opt-out (suppressed) / out-of-office
```

1. **One input.** `startAutopilotAction` crawls the site, synthesizes ICP + offers, detects the booking link (Calendly, Cal.com, HubSpot, SavvyCal, Google appointments…), matches up to 500 leads, and launches. If no booking link is found, it asks for exactly that one thing.
2. **Shared infrastructure.** Leads come from the platform directory (`data/leads.db`), mail goes out through admin-managed system-pool mailboxes. Prospects contacted by any client in the last 90 days are skipped so the pool isn't burned on duplicates.
3. **Reply agent.** Every inbound reply on an autopilot campaign is triaged (LLM when a key is configured, deterministic heuristics otherwise) and passed through a pure, unit-tested policy (`decideAction`). The agent may only send the booking link or content from the client's knowledge base; anything else is escalated.
4. **Human in the loop.** Escalations land in **Needs you** and are emailed to the client. Their answer is turned into a reply, sent in-thread, and saved to the knowledge base, so the next lead who asks the same thing gets an answer without bothering them.
5. **Modes.** Per campaign: *Autopilot* (agent replies), *Approve first* (agent drafts, client approves), *Off* (classify only).

See [docs/REPLY_AGENT.md](docs/REPLY_AGENT.md) for the agent's policy and guardrails.

## Repository

```
apps/web                 Next.js 15 app (UI, server actions, auth, research, autopilot)
packages/email-engine    Scheduler, SMTP processor, IMAP sync, reply agent, AI calls
packages/database        Drizzle schema, crypto (AES-256-GCM), templates, spintax
packages/ui              Design-system primitives
packages/shared          Constants and formatting
packages/validation      Zod schemas
scripts/                 Ops + test scripts (e2e-reply-agent.ts, lead ingestion, seeds)
```

## Local development

Requirements: Node 22.13+ (`node:sqlite`), PostgreSQL 15+.

```bash
npm ci
cp .env.example apps/web/.env.local        # fill DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY, APP_URL, BETTER_AUTH_URL
                                           # and set ENGINE_DRY_RUN=1 so a local engine never sends real mail
npm run db:migrate                         # idempotent; baselines DBs built by runtime self-heal
npm run dev                                # web on :3000
npm run engine                             # sending engine + IMAP sync + reply agent
```

The engine reads `apps/web/.env.local` too, so no separate engine env file is needed. If you create
`packages/email-engine/.env`, put only engine-specific overrides in it: it is loaded first and an
empty `KEY=` line there hides the web value.

### Lead directory

The lead directory (`data/leads.db`, SQLite) holds personal data and is **not** in git. Get a copy
from the project owner out of band and put it at `data/leads.db`, or build a local one from your own
CSV export:

```bash
node scripts/ingest-leads.mjs --file /path/to/leads.csv --db data/leads.db
npm run leads:index -- --db data/leads.db
```

Without it the directory is empty and autopilot finds no leads. See
[docs/LEADS_OPERATIONS.md](docs/LEADS_OPERATIONS.md). (An older `data/leads.db.gz` remains in the git
history until it is purged; do not re-add it.)

Optional: `GEMINI_API_KEY` or `OPENAI_API_KEY` (or a key saved in Settings → AI) enables LLM research, per-lead copy, and LLM reply triage. Without one, research uses a grounded heuristic, sends use the approved baseline copy (never invented claims), and the reply agent uses heuristics.

## Tests

```bash
npm run typecheck
npm test                                   # unit tests across all workspaces
```

Live end-to-end test against real mailboxes (local DB only; refuses to run if any other campaign is running):

```bash
E2E_MAILBOXES=/path/outside/repo/mailboxes.json npx tsx scripts/e2e-reply-agent.ts setup
… send | reply <persona> [script] | agent | inspect | teardown
```

## Deployment

Production is a single Oracle VM: checkout in `/home/ubuntu/chad-gtm`, PM2 processes `chadgtm-web`
(:3005, behind Caddy at https://autogtm.tech) and `chadgtm-worker`, Postgres database `chadgtm`.

Pushing to `main` runs `.github/workflows/deploy.yml` (needs the `SERVER_HOST`, `SERVER_USER` and
`SSH_PRIVATE_KEY` repository secrets). It takes the deploy lock, fetches `main`, and runs
`scripts/deploy-remote.sh` from the fetched commit: preflight (including a check that web, worker
and migrations all use the `chadgtm` database) → fast-forward → `npm ci` → `pg_dump` backup →
**`db:migrate`** → build → `pm2 reload chadgtm-web` / `chadgtm-worker` → health check on
`/api/health`. A failure before the reload puts the previous commit, `node_modules` and `.next`
back. The (public) workflow log shows pm2 status only, never application logs. Only the two
AutoGTM processes are touched, never `pm2 all`.

Manual deploy, same steps: `SERVER_HOST=<vm> python3 scripts/deploy_remote_chadgtm.py`.

In production `/api/engine/tick` requires `CRON_SECRET`. `GET /api/health?strict=1` is the uptime
check (also fails when the engine has not ticked for 10 minutes).

Rollback, backup and restore (`scripts/backup-db.sh`), secret rotation
(`scripts/rotate-encryption-key.ts`), monitoring and the full environment variable reference are in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## License

Source-available, non-commercial and internal use only. See [LICENSE.md](LICENSE.md).

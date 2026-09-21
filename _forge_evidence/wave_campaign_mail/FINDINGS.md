# Wave campaign→mail findings (Forge) — 2026-09-21 ~23:24 CEST

Worktree: `wt-forge` @ branch `forge/campaign-mail-e2e`
Constraint: **no restart** of :3000 or email engine (Sentinel live). Code+commits only.
Mailboxes: use 17 OK accounts; skip known-bad indices 07/17/19.

## Fixes landed

### 1. Scheduler enqueue counter + orphan `scheduled` leads
**File:** `packages/email-engine/src/scheduler.ts`
- Post-loop `enqueued = … + (budget >= 0 ? 1 : 0)` reported **enqueued=1 when 0 jobs inserted** (all suppressed / empty loop).
- Missing lead `continue` left `campaign_leads.status='scheduled'` with **no** `email_jobs` → permanent `waiting-retry`.
- Missing template after claim left leads scheduled forever → now **unclaims → queued**.
- `senders-exhausted` used `claimedRows.slice(enqueued)` which **re-queued already-enqueued** leads when suppressions appeared mid-batch → now uses `handledIds`.

### 2. Dashboard / analytics stats counters
**File:** `apps/web/lib/queries.ts`
- `emailsQueuedToday` was `pending_jobs + COUNT(sender usage rows)` — COUNT≠SUM and usage is **sent** volume, so "Queued today" inflated (e.g. 4 sent → Queued=4).
- Now: queued = in-flight jobs only; sent = `max(sent jobs today, SUM(campaign usage today))`.

### 3. Duplicate / draft → Start = 0 leads
**File:** `apps/web/lib/actions.ts`
- `duplicate` created draft **without** `campaign_leads`; Start only flipped status → engine completed empty.
- `ensureCampaignLeadSnapshot` on start/resume + duplicate.

## Quality gates
- `npm run typecheck -w @smartreach/email-engine` → 0
- `npm run typecheck -w @smartreach/web` → 0
- `npm run test -w @smartreach/email-engine` → 10 passed

## Restart needed to pick up engine/web changes (DO NOT run here)
```bash
# After Sentinel finishes — parent/operator only:
# kill $(cat _forge_evidence/engine.pid) ; npm run engine
# kill $(cat _forge_evidence/dev.pid)    ; npm run dev --workspace @smartreach/web
# Or: pkill -f 'tsx src/run.ts' / next dev -p 3000 then relaunch from wt-forge root.
```

## Remaining blockers / notes
1. **Live engine still on old code** until restart — Sentinel owns process.
2. **F17 soft postal** — footer omitted if workspace address empty (not hard-blocked).
3. **Bad mailboxes** 07/17/19 — skip for any live send E2E.
4. **campaignAction UI** still calls `resume` for non-paused Start (same server path as start; snapshot now covers both).
5. No full create→send E2E re-run in this helper (no engine restart / no steal of Sentinel).

## Cross-check (parallel Forge E2E, same wave)
`e2e_report.json` / `MUST_GAPS.md`: live create→SMTP→IMAP reply **PASS** on 17 good mailboxes (engine already running; old binary). blockers:[].

Additional remaining gap (not code-fixed here — product default):
- Wizard/DEFAULTS `09:00–18:00` → night CE create stalls with `outside-window`. Mitigation: equal start/end (`00:00`) = all-day. Prefer Atlas/Prism default change.

## Commits (this helper)
- `6998b90` fix(engine): enqueue count + orphan scheduled leads
- `15ed30e` fix(web): dashboard queued/sent stats
- `0853750` fix(web): lead snapshot on start/duplicate
- `9ee329a` docs(forge): wave evidence

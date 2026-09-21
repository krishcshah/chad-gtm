# Dry-run vs live queue isolation

## Problem
`ENGINE_DRY_RUN=1` and live engines shared `email_jobs`, so dry-run leftovers were claimable by live workers.

## Fix
1. Column `email_jobs.dry_run boolean NOT NULL DEFAULT false`
2. Scheduler stamps `dryRun: isEngineDryRun()` on enqueue
3. `claimDueJobs` / `recoverStuckJobs` filter `WHERE dry_run = worker mode`
4. In-memory `workerOwnsJob` filter as belt-and-suspenders
5. Migration `0002_email_jobs_dry_run`

## Isolation
| Worker env | Claims |
|---|---|
| unset / 0 / false | `dry_run = false` (live) |
| 1 / true | `dry_run = true` (dry-run) |

## Migration
- Name: `0002_email_jobs_dry_run`
- Also recreates poll/recovery indexes to include `dry_run`
- Catch-up: campaigns sending_window defaults 00:00 (from prior schema change)

## Tests
See `test.txt` — 13 passed including claimDueJobs dry↔live isolation.

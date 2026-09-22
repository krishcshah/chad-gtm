# Tip B — F03d lead status (0009) — column+filter ONLY

## Enum (aligned existing `leads.status`)
`new | contacted | replied | bounced | unsubscribed | blocked` (default `new`)

Legacy remap in `0007_leads_status.sql`:
- pending/queued → new
- sent/completed/failed → contacted
- replied/bounced kept; unknown → new

## API
- `updateLeadStatus({ leadId, status })` (+ `updateLeadStatusForUser` for tests)
- `listLeads` / `fetchLeadsPage` already filter by `status` — validation enum updated

## Engine auto-promote (minimal; Unibox tags do NOT change status)
- send success → `contacted`
- reply detected (sync-replies) → `replied` (unchanged path)
- permanent bounce → `bounced`; soft fail → `contacted`
- one-click unsub (`processUnsubscribe`) → matching leads `unsubscribed`
- `blocked` is manual via `updateLeadStatus` only

## Shared / UI
- `LEAD_STATUSES` in `@smartreach/shared`
- Lead table filter Select uses `LEAD_STATUSES`
- Badge variants for new/contacted/unsubscribed/blocked

# MUST / gap list — wave_campaign_mail (Forge)

**When:** 2026-09-21 ~23:24 CEST  
**Branch:** `forge/campaign-mail-e2e` (from `234c2be`)  
**Engine:** Sentinel live (`ENGINE_DRY_RUN=0`) — Forge did **not** restart :3000/engine

## Passed
| Step | Result |
|------|--------|
| Mailbox smoke (17 good / 3 removed) | smtpOk/imapOk documented in mailbox_smoke_20.json (prior 17/20; Relay pruned bad 3) |
| Import ≥2 real senders (AES encrypted) | PASS — contact@ + hello@ (krishshah.work) via krishshah.cloud |
| Lead list → other test mailbox | PASS |
| Template merge tags + compliance footers (engine) | PASS (engine enqueue path) |
| Create+start campaign → live enqueue+SMTP send | PASS — Forge Live Campaign job sent (non dry-run message-id) |
| Stats counters (sent / usage_counters) | PASS — campaign completed; campaign_leads sent→replied |
| IMAP sync / Unibox reply | PASS — campaign_lead status=`replied`; replies row present |

## Gaps / blockers (repro)
1. **Night sending window** — default `09:00–18:00` misses CE late evening. Repro: create campaign at 23:xx Europe/Berlin with defaults → scheduler skips until window. **Mitigation used:** `sending_window_start=sending_window_end=00:00` (all-day). **Ask Atlas/Prism:** wizard default “all day” or TZ-aware warning.
2. **minDelaySec default 90** — E2E feels stuck; Forge used 5. Not a bug; document for ops.
3. **Engine ownership** — live path requires `ENGINE_DRY_RUN=0` daemon. Forge blocked from restart while Sentinel owns process; coordinate via Atlas.
4. **3 bad mailboxes (removed by Relay)** — hey1hello1@krishshah.work, notifications@krishshah.cloud, test1@krishshah.cloud auth 535 — out of mail.env; no Forge action.
5. **Prism UI** — no wt-prism edits. Stats/Unibox beauty not verified in browser; API/DB proof only. Request: Prism confirm dashboard cards bind to `emailsSentToday` / replies queries after live send.

## Non-goals this wave
- Push / GitHub / Vercel
- Softening failures

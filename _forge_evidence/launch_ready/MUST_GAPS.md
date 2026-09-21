# Launch-ready Must gaps — SmartReach

**When:** 2026-09-21 23:42 CEST (Europe/Berlin)  
**Worktree:** `/workspace/work/smart-reach/wt-forge`  
**Branch / tip:** `integrate/campaign-prism` @ `bf597ae` (`bf597aee36c396b818221edd05b221d510ee5eae`)  
**SPEC:** `/workspace/work/smart-reach/SPEC.md` (F01–F17 Must)  
**DECISIONS:** `/workspace/work/smart-reach/DECISIONS.md` (solo FOSS; sequences=Should/F19; reply-first metrics; MIT; Neon+CF target; box-first)  
**Constraint honored:** no GH push; no `:3000` / engine restart (Sentinel final-smoking)

---

## 1. Must items DONE (with file refs)

| ID | Feature | Evidence on tip |
|----|---------|-----------------|
| **F01** | Email/password auth | `apps/web/lib/auth.ts` (Better Auth); `apps/web/app/(auth)/login`, `signup`; `apps/web/app/api/auth/[...all]` |
| **F02** | Lead lists + CSV import + mapping | `importLeads` in `apps/web/lib/actions.ts`; UI `apps/web/app/(app)/leads/import/` |
| **F03** | Lead edit / delete / tag | `updateLead`, `bulkDeleteLeads`, `bulkTagLeads`, `createLeadTag`; UI `leads/[id]/` *(manual create: see defer)* |
| **F04** | SMTP+IMAP senders, AES at rest, test | `createSender`, `testSenderConnection`; `packages/database/src/crypto.ts` (`ENCRYPTION_KEY`); `senders/new`, `sender-form.tsx` |
| **F05** | Bulk sender CSV | `importSendersCsv`; `apps/web/app/(app)/senders/import/` |
| **F06** | Fair rotation + daily/hourly caps | `packages/email-engine/src/rotation.ts` + scheduler cap checks |
| **F07** | Humanized random delay | jitter / min–max delay in `packages/email-engine/src/scheduler.ts` |
| **F08** | Campaign wizard | `apps/web/app/(app)/campaigns/new/`; `createCampaign` |
| **F09** | Lifecycle draft/schedule/run/pause/resume/archive/delete | `campaignAction`; scheduler promotes due `scheduled` → `running` |
| **F10** | Durable Postgres queue + worker | `email_jobs` in schema; `scheduler.ts`, `processor.ts`, `worker.ts`, `run.ts`; dry/live split `queue-mode.ts` @ `d968b2e` |
| **F11** | Stop-on-reply + IMAP sync + Unibox | `stopOnReply`; `sync-replies.ts`; `apps/web/app/(app)/unibox/`; prior Sentinel live PASS |
| **F12** | Templates `{{var}}` text+HTML | `packages/database/src/template.ts`; templates UI |
| **F13** | Dashboard + campaign analytics | **Partial** — sent/queued/failed/replied in `apps/web/lib/queries.ts`, `/dashboard`, `/analytics`; **bounce counts not surfaced** (see OPEN) |
| **F15** | Global suppression | `suppressions` table; `matchesSuppression` in `compliance.ts`; scheduler+processor; Settings `compliance-forms.tsx`; `addSuppression` / `removeSuppression` |
| **F16** | One-click unsub + List-Unsubscribe | tokens/headers/footers in `compliance.ts`; `/unsubscribe`; `POST /api/unsubscribe`; engine loads web `BETTER_AUTH_SECRET` @ `234c2be` (Sentinel F16 PASS) |
| **F17** | Postal footer when configured | `workspace_settings.postal_address`; Settings UI; `ensurePostalFooter` in scheduler/processor — **soft only** (see OPEN) |

**Prior live proof (not re-run this turn):** Sentinel live SMTP + Unibox + stop-on-reply + compliance MIME PASS (`SENTINEL_LIVE_E2E.md`, retests including `c2b6723` / `d968b2e`). Queued/sent stats PASS after `15ed30e`.

**F14 (Should):** soft deletes + `activity_logs` present — not a Must launch gate.

Supporting inventory (earlier): `_forge_evidence/MUST_INVENTORY.md`.

---

## 2. Must items STILL OPEN that BLOCK usable personal launch

Scope: **campaign / stats / mail / compliance** on this tip.

### B1 — Auth `trustedOrigins` rejects `http://127.0.0.1:3000` (F01)

**Why it blocks launch:** Final smoke and any client using host `127.0.0.1` cannot sign up/in. `_sentinel_final_smoke/report.json` @ tip → **NO-GO** (`boxLaunchReady: false`, signup/signin **403**). Browser on `http://localhost:3000` works; `http://127.0.0.1:3000` does not.

**Code:** `apps/web/lib/auth.ts` → `trustedOrigins: [env.APP_URL]`; `apps/web/lib/env.ts` defaults `APP_URL` to `http://localhost:3000`. `apps/web/.env.local` has `BETTER_AUTH_URL` but **no** `APP_URL`.

**Repro (2026-09-21 23:41 CEST):**
```bash
curl -sS -X POST http://127.0.0.1:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' -H 'origin: http://127.0.0.1:3000' \
  -d '{"email":"nogap2@example.com","password":"testpass123","name":"N"}'
# → 403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}

curl -sS -X POST http://127.0.0.1:3000/api/auth/sign-up/email \
  -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"ok-$(date +%s)@example.com","password":"testpass123","name":"N"}'
# → 200 + session token
```
Smoke artifact: `_sentinel_final_smoke/signup_snip.txt` → `Missing or null Origin` (harness omitted Origin header).

### B2 — F17 postal address not hard-enforced on live send (compliance)

**Why it blocks compliant personal launch:** SPEC F17 + US-06 / CAN-SPAM require a physical postal address. Empty `workspace_settings.postal_address` → footer **omitted**; enqueue/send still proceeds. Easy to ship non-compliant live mail.

**Code:** `ensurePostalFooter` no-ops on blank address; scheduler/processor only append when `if (postalAddress)` / `if (postal)`. Called out as open/soft in `_forge_evidence/MUST_INVENTORY.md`.

**Repro:**
1. Leave Settings postal empty.
2. Run campaign (`ENGINE_DRY_RUN=0` or inspect dry-run body).
3. Body lacks postal marker (`-- physical address --` / `data-sr-postal`); job still reaches `sent`.

### B3 — F13 bounce counts missing from operator stats

**Why it blocks SPEC-complete stats:** F13 Requires **sent/failed/replied/bounce** counts. Engine marks `bounced` on permanent SMTP failures (`processor.ts` ~309–313), but UI/queries expose only sent / queued / failed / replied — **no bounce metric**.

**Code:** `getDashboardStats` in `apps/web/lib/queries.ts` (`emailsSentToday`, `emailsQueuedToday`, `failedToday`, `replyCount`); `/dashboard`, `/analytics`, campaign detail — no bounced tally.

**Repro:**
1. Produce a permanent bounce (`email_jobs.status='bounced'` / lead bounced).
2. Open `/dashboard` and `/analytics`.
3. No bounce card/column (bounce invisible or folded only into failed/DB).

### Smoke cascade (symptom of B1)

Auth failure → harness has no `userId` → any `workspace_settings` insert dies on FK `workspace_settings_user_id_users_id_fk`. Fix B1 first.

---

## 3. Nice-to-have / defer

| Item | Notes |
|------|-------|
| **F03 manual single-lead create** | No `createLead` — CSV/`importLeads` only. Edit/delete/tag exist. Workaround: 1-row CSV. |
| **F17 dry-run exception** | Hard-block **live** only; keep dry-run soft so local proofs still run. |
| **F14** Soft delete + activity | Present; Should. |
| **F18** Bounce taxonomy + auto-pause | Should; partial sender health penalty in processor — not Must. |
| **F19** Multi-step sequences | DECISIONS: Should / next wave. |
| **F20–F32** | Per SPEC Should/Could/Won’t. |
| **LICENSE MIT** | DECISIONS chose MIT; **no LICENSE file** in tree — hygiene, not runtime. |
| **Outside-window UX** | Explicit 09–18 at night stalls (engine log); default all-day `00:00–00:00` @ `c2b6723`. Non-blocking. |
| **Cross-user campaign URL shell** | Solo FOSS; 404 hygiene later. |
| **Unibox encoding nits** | Display only. |
| **ESLint** | Root `lint` → typecheck. |
| **Prod deploy / DNS / push** | Krish park — out of Forge code slice. |

---

## 4. Recommended fix order for Forge (code only)

1. **B1 / F01 Origin** — Set `APP_URL` in `apps/web/.env.local`; expand `trustedOrigins` to both `http://localhost:3000` and `http://127.0.0.1:3000` (align with `BETTER_AUTH_URL`). Re-prove signup with `Origin: http://127.0.0.1:3000`. *Coordinate any env/process bounce with Sentinel — do not restart unilaterally.*
2. **B2 / F17 live hard-enforce** — If `!postalAddress && !dryRun` → do not send; fail job with clear error; Settings CTA when empty. Dry-run stays soft.
3. **B3 / F13 bounce metrics** — Count `bounced` beside `failed` in `getDashboardStats`, campaign list/detail, dashboard + analytics cards.
4. **(Optional)** `createLead` + “Add lead” on list detail (F03 polish).
5. **(Optional)** Root `LICENSE` (MIT).

**Do not:** GH push; restart `:3000`/engine unless Sentinel clears; commit mailbox secrets.

---

## 5. Scorecard vs SPEC Must (F01–F17)

| ID | Status on `bf597ae` |
|----|---------------------|
| F01 | Done with **B1** (127.0.0.1 origin) |
| F02 | Done |
| F03 | Done except manual create (defer) |
| F04–F12 | Done |
| F13 | Partial — **B3** bounce |
| F14 | Should / present |
| F15–F16 | Done |
| F17 | Partial — **B2** soft enforce |

**Box launch-ready?** **No** — until B1–B3 cleared (B1 blocks 127-login/smoke; B2 blocks compliant mail; B3 blocks SPEC stats).

---

*End MUST_GAPS — Forge inventory only; no app/runtime changes this turn.*

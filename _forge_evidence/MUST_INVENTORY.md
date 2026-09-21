# Must inventory vs SPEC (Forge) — 2026-09-21

## F15 — Global suppression / block list
| Area | Status | Paths |
|------|--------|-------|
| Schema | **Fixed** | `packages/database/src/schema.ts` → `suppressions` |
| Migration | **Fixed** | `apps/web/drizzle/0001_rich_odin.sql` |
| Match helpers | **Fixed** | `packages/database/src/compliance.ts` (`matchesSuppression`) |
| Enqueue check | **Fixed** | `packages/email-engine/src/scheduler.ts` (cancel campaign_lead) |
| Send-time check | **Fixed** | `packages/email-engine/src/processor.ts` |
| API / UI | **Fixed** | `apps/web/lib/actions.ts` (`addSuppression`, `removeSuppression`); Settings UI `apps/web/app/(app)/settings/compliance-forms.tsx` |
| Tests | **Fixed** | `packages/database/src/__tests__/compliance.test.ts` |

## F16 — One-click unsubscribe + List-Unsubscribe
| Area | Status | Paths |
|------|--------|-------|
| Token HMAC | **Fixed** | `packages/database/src/compliance.ts` |
| Body link | **Fixed** | scheduler + processor via `ensureUnsubscribeFooter` |
| Headers | **Fixed** | processor `listUnsubscribeHeaders` + `List-Unsubscribe-Post`; URL → `/api/unsubscribe?token=` |
| Public page | **Fixed** | `apps/web/app/unsubscribe/page.tsx` |
| One-click POST | **Fixed** | `apps/web/app/api/unsubscribe/route.ts` |
| Immediate suppress | **Fixed** | `processUnsubscribe` → inserts suppression `source=unsubscribe` |

## F17 — Physical postal address / CAN-SPAM footer
| Area | Status | Paths |
|------|--------|-------|
| Settings schema | **Fixed** | `workspace_settings.postal_address`, `company_name` |
| Settings UI | **Fixed** | Settings compliance card |
| Outbound enforce | **Fixed** | scheduler enqueue + processor send (`ensurePostalFooter`) |
| Hard block if empty | **Open / soft** | Footer omitted when address unset — operator must save address in Settings before compliant live sends. Not a hard send-blocker (would brick dry-run). Documented for operators. |

## CSV → list → campaign → engine send path
| Step | Status | Notes |
|------|--------|-------|
| CSV import | **Present** | `importLeads` in `apps/web/lib/actions.ts`, UI `apps/web/app/(app)/leads/import/` |
| Add sender | **Present** | `createSender` / CSV import |
| Template | **Present** | `upsertTemplate` |
| Start campaign | **Present** | `createCampaign` + `campaignAction` |
| Engine enqueue | **Present** | `scheduler.ts` → `email_jobs` |
| Engine send | **Present** | `processor.ts`; `ENGINE_DRY_RUN=1` supported for local proof without SMTP |
| Local DB driver | **Fixed** | `packages/database/src/connection.ts` (pg for localhost); `apps/web/scripts/migrate.ts` was missing — added |
| Corrupted `p.end())` | **Removed** from wt-forge worktree | Do not commit secrets |

## Quality gates (observed)
- `npm run db:migrate` — exit 0 (see `db_migrate.txt`, `db_migrate2.txt`)
- `npm run typecheck` — exit 0 (see `typecheck.txt`)
- `npm run test` — exit 0, 25 tests (see `test.txt`)
- lint — root `"lint": "npm run typecheck"` (no ESLint yet; Relay INFRA)

## Still open / blocked
- Live SMTP between krishshah.test mailboxes: **mail secrets pending Relay** (do not put chat passwords in env/commits)
- Hard require postal address before enqueue: deferred (soft enforce)
- Multi-step sequences (F19 Should) — out of this Must slice

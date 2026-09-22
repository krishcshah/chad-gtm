# F19 assumptions (SPEC gaps)

1. No top-level `sequences` table — `sequence_steps.campaign_id` is the parent.
2. `delayDays` lives on the **destination** step (wait after previous send before this step).
3. Variant selection = weighted random among non-paused; save forces 50/50 when exactly 2 variants.
4. Vars then spintax at enqueue (same path as preview); not re-expanded in SMTP processor.
5. Publish still requires `templateId` via existing wizard; sequences are additive overlay.
6. First step `delayDays` usually 0; not auto-forced — Prism may send 0.

7. Web `tsc` on origin/main tip fails on missing `dompurify` types (`apps/web/lib/email-html.ts`) — pre-existing Unibox HTML work, not F19. Database/validation/email-engine + F19 web tests green.

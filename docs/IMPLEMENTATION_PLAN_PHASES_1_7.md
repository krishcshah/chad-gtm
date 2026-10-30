# AutoGTM — Implementation Plan, Phases 1–7

**Status:** Phase 1 implementation starts after this document.  
**Scope:** The seven phases from `docs/AUTOGTM_AUTONOMY_GAP_ANALYSIS.md`. The "beyond" ideas (multi-channel, self-improving twin, etc.) are explicitly out of scope for now.  
**Core principle:** Agentic where judgment is needed. Deterministic where delivery is needed.

---

## 0. Decisions Up Front

These are the defaults we will build against unless changed:

1. **The sender stays deterministic.** The agent never decides whether to bypass caps, suppression, or unsubscribe. It proposes; the deterministic engine enforces.
2. **Human approval at three gates:** strategy, voice/sample deck, launch. Replies that commit the user (booking, pricing, legal) also require approval unless the user explicitly enables auto-confirm.
3. **No account creation for scheduling.** Users can paste an existing Calendly/Cal.com link, use the zero-setup ICS path, or optionally connect Google Calendar. No one is forced to create a scheduling account.
4. **Evidence before copy.** No generated claim reaches a prospect without a source or an explicit "unverified" flag. Unverified claims are blocked by the critic.
5. **Global contact ledger from day one.** No prospect is contacted twice across campaigns/workspaces without an explicit frequency policy.
6. **Fail closed on AI failure.** No fabricated fallback copy. If generation fails, the send is blocked and the run is marked failed.
7. **Trace everything.** Every agent step, tool call, prompt, response, latency, token count, and cost is durable and replayable.
8. **One workspace = one GTM brain.** Style, ICP priors, scheduling, and outcomes are workspace-scoped. Leads and contact history are global for safety.

---

## 1. Phase 1 — Agent Runtime, Tools, and Traces

### 1.1 Goal

Build the harness that every later phase plugs into. It must be possible to:

- Start a run with a goal and input.
- Execute typed tools with validation, timeout, retry, and error capture.
- Persist every step and artifact.
- Pause for human approval.
- Resume, retry, or cancel a run.
- Replay a run step-by-step from the database.

Phase 1 does **not** need an LLM planner yet. A deterministic planner that follows a phase graph is enough. The planner interface must allow an LLM planner in Phase 2.

### 1.2 Architecture

```
apps/web/lib/agent/
  types.ts          shared types, schemas
  store.ts          DB persistence (agent_runs, agent_steps, ai_generations)
  registry.ts       typed tool registry + validation + timeout
  planner.ts        Planner interface + deterministic GTM planner
  runtime.ts        run/step loop, pause/resume/retry/cancel
  tools.ts          Phase 1 tool implementations
  trace.ts          sanitization + trace view helpers
```

### 1.3 Data model

```sql
agent_runs (
  id text primary key,
  user_id text not null,
  workspace_id text,
  kind text not null,                 -- gtm_analysis, gtm_campaign, reply_agent...
  goal text not null,
  status text not null,               -- running | waiting_approval | completed | failed | cancelled
  phase text not null,                -- intake | research | strategy | ...
  input jsonb not null default '{}',
  state jsonb not null default '{}',
  error text,
  budget_cents integer,
  started_at text not null,
  finished_at text,
  created_at text not null,
  updated_at text not null
);

agent_steps (
  id text primary key,
  run_id text not null references agent_runs(id) on delete cascade,
  seq integer not null,
  agent text not null,                -- research | strategist | prospector | copywriter | critic | sender | analyst
  tool text,                          -- null for pure reasoning steps
  status text not null,               -- running | succeeded | failed | skipped
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error text,
  latency_ms integer,
  tokens integer,
  cost_micros integer,
  started_at text not null,
  finished_at text,
  created_at text not null
);

ai_generations (
  id text primary key,
  run_id text references agent_runs(id) on delete set null,
  step_id text references agent_steps(id) on delete set null,
  user_id text not null,
  purpose text not null,              -- strategy | email | calibration | reply
  provider text not null,
  model text not null,
  prompt_hash text,
  prompt text,
  response text,
  tokens_in integer,
  tokens_out integer,
  cost_micros integer,
  latency_ms integer,
  created_at text not null
);
```

Plus `chad_gtm_runs.agent_run_id` so the existing mission control can link to the trace.

### 1.4 Tool contract

```ts
type ToolDefinition<I, O> = {
  name: string;
  description: string;
  inputSchema: ZodType<I>;
  outputSchema: ZodType<O>;
  timeoutMs?: number;
  requiresApproval?: boolean;
  run(input: I, ctx: AgentContext): Promise<O>;
};
```

Rules:

- Every tool input is validated before execution.
- Every output is validated before persistence.
- Timeouts abort the tool and mark the step failed.
- Secrets are redacted from persisted input/output.
- Large outputs (crawl corpus, strategy) are stored once in `agent_runs.state` or `agent_artifacts`, not duplicated in every step. Phase 1 can store them in state; Phase 2 adds artifacts.
- A tool never sends email directly. Sending is a governed action with its own policy checks.

### 1.5 Phase 1 tools

| Tool | Input | Output | Used by |
|---|---|---|---|
| `crawl_company` | `{ url }` | `ScrapedCompanyData` | analysis |
| `synthesize_strategy` | `{ notes? }` | `SynthesizedGtmStrategy` | analysis |
| `persist_gtm_run` | `{ strategy, url }` | `{ chadGtmRunId }` | analysis |
| `get_directory_facets` | `{}` | `DirectoryFacets` | research/prospecting |
| `search_leads` | `{ industries?, titles?, limit?, offset? }` | `{ leads, total }` | prospecting |
| `get_campaign_stats` | `{ campaignId }` | KPI object | analyst/monitor |
| `check_domain_dns` | `{ domain }` | `{ hasDefect, description? }` | research/admin |

Phase 2 adds: `search_web`, `extract_claims`, `enrich_company`, `verify_email`, `classify_reply`, `book_meeting`, `sync_crm`.

### 1.6 Planner

Phase 1 deterministic planner for `kind = "gtm_analysis"`:

```
intake:
  if !state.scraped -> crawl_company
research:
  if !state.strategy -> synthesize_strategy
strategy:
  if !state.chadGtmRunId -> persist_gtm_run
complete:
  -> complete
```

The planner can also return `approval` for `kind = "gtm_wizard"` when it reaches `strategy_review` or `copy_review`. The runtime supports it; the wizard migration comes in Phase 1.5.

### 1.7 Runtime behavior

- `start()` creates a run with status `running`.
- `advance()` executes exactly one planner decision and persists it.
- `runUntilPause()` loops until `waiting_approval`, `completed`, `failed`, `cancelled`, or `maxSteps` (default 20).
- On tool failure: step `failed`, run `failed`, error stored. `retry()` sets the run back to `running` and re-advances; the planner uses `state` to skip completed work.
- On approval: run `waiting_approval`, phase set, reason stored in state. `resume()` sets `running`.
- Every step gets a monotonic `seq`.
- `cancel()` sets status `cancelled`; in-flight tools are not killed (Phase 1 limitation), but the run will not advance.

### 1.8 Integration with the existing wizard

`analyzeWebsiteAction` becomes:

1. Create an `agent_run` (`kind = "gtm_analysis"`, goal = URL).
2. Run `crawl_company` → `synthesize_strategy` → `persist_gtm_run`.
3. Return `{ runId, strategy, agentRunId }`.
4. If the runtime fails, fall back to the existing direct path and mark the agent run failed. The user must never be blocked by the new harness.

The existing `chadGtmRuns` row remains the product object. The agent run is the execution trace.

### 1.9 Trace UI

Route: `/chad-gtm/[id]/trace`

Shows:

- Run header: goal, kind, status, phase, started/finished.
- Step timeline: seq, agent, tool, status, latency, error.
- Step input/output JSON, pretty-printed and redacted, truncated to 2,000 chars per field.
- Link back to mission control.

Mission control gets a "View Agent Trace" button when `agentRunId` exists.

### 1.10 Tests

- Registry rejects invalid input and unknown tools.
- Registry times out a slow tool.
- Runtime creates sequential steps and stops at approval.
- Runtime retries from state without repeating completed tools.
- Planner returns the expected sequence.
- Trace sanitizer redacts password/token/secret/apiKey and truncates large values.

### 1.11 Acceptance

- A user can run an analysis and see every step in the trace UI.
- Every step has input, output, status, latency, and timestamps.
- A failed tool can be retried without repeating successful steps.
- The existing wizard still works if the agent runtime is disabled.
- No secrets appear in traces.

---

## 2. Phase 2 — Research Agent and Evidence Graph

### 2.1 Goal

Replace "one crawl + one prompt" with a bounded research loop that produces an evidence-backed company model.

### 2.2 New tools

| Tool | Purpose |
|---|---|
| `search_web` | Search for news, pricing, reviews, competitors, funding, hiring |
| `fetch_page` | Fetch a URL with static/headless extraction |
| `extract_claims` | Convert pages into claim/source/quote/confidence triples |
| `enrich_company` | Firmographics, headcount, tech stack, funding, location |
| `find_competitors` | Identify competitors from search and review sites |
| `find_proof` | Find case studies, ROI metrics, customer names |

Search provider: start with a configurable provider (Tavily, Brave Search, or SerpAPI). If no key, degrade to direct page fetches from discovered links. Do not scrape Google directly.

### 2.3 Evidence graph

```ts
type Claim = {
  id: string;
  runId: string;
  text: string;
  sourceUrl: string;
  sourceQuote: string;
  confidence: number;
  verified: boolean;
  category: "positioning" | "pricing" | "proof" | "competitor" | "persona" | "firmographic";
};
```

The Strategist consumes only claims with `confidence >= threshold`. The Critic rejects any output claim not backed by a claim.

### 2.4 Research loop

```
plan research questions
  -> search
  -> fetch top pages
  -> extract claims
  -> evaluate coverage (positioning, pricing, proof, competitors, personas)
  -> if coverage < threshold and budget remains, repeat with new queries
  -> produce evidence-backed company model
```

Budget: max 8 searches, 12 fetches, 60s per run (configurable). Every call is traced.

### 2.5 Strategy critic

A second LLM call (or deterministic checks + LLM) evaluates:

- Every claim in the strategy resolves to evidence.
- Personas are distinct and grounded.
- Offers are specific to the company, not generic.
- No invented metrics, customers, or integrations.
- Pricing statements match the source.

If the critic fails the strategy, the Strategist revises. Max 2 revisions.

### 2.6 Acceptance

- ≥80% of strategy claims have source URLs.
- Unsupported claims are blocked before the strategy board.
- Research covers news, pricing, customers, competitors, and hiring signals.
- The trace shows every search, fetch, claim, and revision.

---

## 3. Phase 3 — Prospector, Verification, and Global Contact Ledger

### 3.1 Goal

Turn ICP into a ranked, verified, deduplicated prospect set, with global contact safety.

### 3.2 Query compiler

ICP JSON → structured query:

```ts
type ProspectQuery = {
  industries: string[];
  titles: string[];
  seniorities: string[];
  companySizes: string[];
  revenueRanges: string[];
  countries: string[];
  exclusions: { domains: string[]; companies: string[]; emails: string[] };
};
```

The compiler maps persona titles and seniority to directory facets, and excludes competitors/customers.

### 3.3 Fit scoring

Two-stage:

1. **Hard filters** (SQL/FTS): industry, title, size, geography, has email.
2. **Soft score** (0–100): title match, seniority match, industry match, company size fit, data completeness, recency, lookalike similarity.

Start with transparent rules. Add embeddings later for lookalike scoring:

```
fit = 0.35 * title_match
    + 0.20 * industry_match
    + 0.15 * size_match
    + 0.10 * seniority_match
    + 0.10 * data_completeness
    + 0.10 * lookalike_similarity
```

Store per-lead `fit_score` and `fit_reasons` for auditability.

### 3.4 Email verification

`verify_email` tool:

- MX lookup.
- SMTP RCPT probe where allowed (with rate limits and a proper HELO).
- Catch-all / disposable / role-account detection.
- Provider adapter (ZeroBounce, NeverBounce, MillionVerifier) if configured.
- Cache results for 30 days.
- Never send to `unknown`/`invalid`/`catch_all` without explicit approval.

### 3.5 Global contact ledger

```sql
contact_ledger (
  id text primary key,
  workspace_id text,
  email_hash text not null,          -- normalized SHA-256
  email_enc text,                    -- optional, for operator display
  first_contacted_at text,
  last_contacted_at text,
  touch_count integer not null default 0,
  last_campaign_id text,
  last_reply_status text,
  suppressed boolean not null default false,
  updated_at text not null
);
```

Policy:

- Before a lead enters a campaign, check the ledger.
- Default frequency: no more than 1 cold touch per 90 days per email across all workspaces.
- If replied/meeting/unsubscribed, block unless explicitly re-engaged.
- Enforce at selection **and** at send time (defense in depth).
- Workspace-level overrides for legitimate re-engagement.

### 3.6 UI changes

The lead matcher must expose:

- Titles and seniority, not just industries.
- Company size, geography, revenue.
- Fit score and reasons.
- Verified-email status.
- Excluded/contacted counts.

### 3.7 Acceptance

- Fit-score calibration report (precision@k).
- Bounce rate <2%.
- Zero cross-campaign duplicates.
- Every selected lead has a fit score and verification status.
- Ledger blocks are visible and auditable.

---

## 4. Phase 4 — Copy Critic, Style Memory, and Experiments

### 4.1 Goal

Make copy quality measurable and make the system learn from outcomes, not just swipes.

### 4.2 Copy loop

```
context (evidence + persona + offer)
  -> draft 2–3 variants
  -> critic scores each on rubric
  -> revise failures
  -> human approval deck
  -> send
```

### 4.3 Rubric

| Dimension | Weight | Check |
|---|---|---|
| Evidence grounding | 30 | Every factual claim has a source |
| Persona fit | 20 | Uses buyer's language and stakes |
| Specificity | 15 | About this company, not any company |
| Length/readability | 10 | 35–70 words, short sentences |
| CTA | 10 | One low-friction permission question |
| Deliverability risk | 10 | No links, spam triggers, excessive punctuation |
| Claim safety | 5 | No invented metrics/customers/integrations |

A draft below 80/100 is revised or blocked. The human sees the rubric and evidence.

### 4.4 Style memory

```sql
style_profiles (
  id text primary key,
  workspace_id text not null,
  name text not null,
  traits_json jsonb not null,        -- tone, length, greeting, CTA style
  exemplars_json jsonb not null,     -- approved samples
  rejection_json jsonb not null,     -- rejected patterns
  source_run_id text,
  created_at text not null,
  updated_at text not null
);
```

- Updated after every calibration and after every winning experiment.
- Loaded automatically for new runs in the same workspace.
- Versioned; the user can pin a profile.

### 4.5 Experiments

```sql
experiments (
  id text primary key,
  campaign_id text not null,
  hypothesis text not null,
  metric text not null,              -- reply_rate, positive_reply_rate, meetings
  status text not null,              -- running, completed, stopped
  min_sample integer not null default 100,
  started_at text,
  ended_at text
);

experiment_assignments (
  id text primary key,
  experiment_id text not null,
  lead_id text not null,
  variant_id text not null,
  outcome text,
  outcome_at text
);
```

- AutoGTM creates 2–3 variants per step, not one.
- Equal-weight start; Thompson sampling or epsilon-greedy after a minimum sample.
- Winner promotion requires statistical confidence; otherwise keep exploring.
- No experiment on deliverability-critical variables (caps, domains).

### 4.6 Acceptance

- Rubric score above threshold before any send.
- Measurable reply-rate lift vs baseline.
- Style consistency across runs.
- Winning variants are promoted from data, not guesswork.

---

## 5. Phase 5 — Reply Agent, Scheduling, and Meetings

This is the phase with the most product ambiguity, so the design is explicit.

### 5.1 The scheduling problem

We cannot:

- Create a Cal.com/Calendly account for the user.
- Require the user to create a new account.
- Assume the user has Google Calendar OAuth configured.

We can:

- Let users paste an existing scheduling link.
- Send a calendar invite (ICS) by email with zero setup.
- Optionally connect Google Calendar for true free/busy booking.
- Notify the user when a prospect agrees to a time.

### 5.2 Three scheduling modes

| Mode | User setup | What the agent does | Best for |
|---|---|---|---|
| **Link** (default) | Paste Calendly/Cal.com/SavvyCal/Google appointment link | Sends the link when interest is detected; tracks clicks/replies | Users who already have a scheduler |
| **Email-confirm + ICS** | Set availability windows + timezone | Proposes 2–3 slots, confirms the chosen slot, sends an ICS invite to prospect + user | Zero-setup users |
| **Google Calendar** (optional) | One-click OAuth connect | Checks free/busy, creates the event, sends invite, blocks the calendar | Users who want full automation |

All three modes are workspace-scoped and can be changed at any time.

### 5.3 Link mode

Settings:

```ts
schedulingMode: "link";
schedulingProvider: "calendly" | "calcom" | "savvycal" | "google_appointment" | "other";
schedulingLink: string;
```

Validation:

- Must be `https`.
- Must match a provider allowlist or a user-confirmed custom domain.
- No open redirects.
- Store provider for display and analytics.

Flow:

1. Reply intent = meeting request.
2. Agent drafts: "Happy to. Here's my calendar: <link>. Pick whatever works."
3. If auto-send is off, the user approves the draft.
4. The agent records a `meetings` row with `status = "link_sent"` and the link.
5. Optional: track link clicks via a redirect endpoint (privacy-aware, no PII leakage).

This is the fastest path for users who already have Calendly/Cal.com. It requires no API integration.

### 5.4 Email-confirm + ICS mode

Settings:

```ts
schedulingMode: "ics";
meetingDurationMinutes: 20;
meetingBufferMinutes: 10;
meetingTimezone: "Europe/Berlin";
availability: {
  mon: [["09:00","12:00"],["13:00","17:00"]],
  tue: ...,
  ...
};
autoConfirmMeetings: false;
notificationEmail: "founder@company.com";
```

Flow:

1. Reply intent = meeting request. Extract requested time, timezone, and constraints.
2. Resolve 2–3 candidate slots from availability, excluding existing meetings and buffers.
3. Agent replies: "I can do Thu 2:00–2:20 PM CET or Fri 10:00–10:20 AM CET. Which works?"
4. Prospect confirms one slot.
5. Agent creates a `meetings` row (`status = "pending_confirmation"`).
6. If `autoConfirmMeetings = true`, send the ICS immediately. Otherwise:
   - Send the user an in-app notification and an email: "Maya Chen agreed to Thu 2:00 PM CET. Approve to send the invite."
   - The email contains a signed one-click approval link.
7. On approval:
   - Send the prospect a confirmation email with an ICS attachment (`METHOD:REQUEST`).
   - Send the user a copy/notification: "Invite sent. Accept it in your calendar to block the time."
   - Mark `meetings.status = "confirmed"`.
8. If the user declines, the agent sends an alternative slot or asks the prospect to pick another time.

ICS details:

- `UID`: stable per meeting (`meeting-<id>@autogtm.tech`).
- `SEQUENCE`: increments on updates.
- `ORGANIZER`: the user's notification email or the sending mailbox.
- `ATTENDEE`: prospect email.
- `DTSTART/DTEND`: with `TZID` and a `VTIMEZONE` block.
- `METHOD:REQUEST`.
- `SUMMARY`: "AutoGTM intro — <company>".
- `DESCRIPTION`: short agenda + meeting link if any.
- Attach as `text/calendar; method=REQUEST; charset=UTF-8`.

Why this works without OAuth:

- Google Calendar, Outlook, and Apple Calendar recognize ICS invites sent to the user's email.
- The user accepts the invite once; it appears on their calendar.
- We do not need free/busy access; we use configured availability and ask the prospect to confirm.
- The user is notified when the prospect agrees, satisfying the "booked on your calendar" experience without requiring an account.

Caveats:

- We cannot guarantee the user's calendar is free at that time without OAuth. The user can approve/decline; the default is approval.
- Timezone ambiguity is real. Always include the timezone in the confirmation and store IANA timezone.
- Use a library (`luxon` or `date-fns-tz`) for parsing and formatting; do not hand-roll DST math.

### 5.5 Google Calendar mode (optional)

Add a "Connect Google Calendar" button in Settings.

OAuth:

- Scopes: `https://www.googleapis.com/auth/calendar.events`, `.../calendar.freebusy`, `userinfo.email`.
- Store encrypted access/refresh tokens in `calendar_connections`.
- Refresh tokens on expiry.
- Use `calendar.freebusy.query` to find open slots.
- Use `events.insert` with `sendUpdates: "all"` to create the event and invite the prospect.
- Store the Google event ID on the meeting for updates/cancels.

Fallback:

- If the token expires or the API fails, fall back to ICS mode and notify the user.
- Never block a reply because Google is down.

Deployment note:

- Google may require OAuth app verification for sensitive scopes. Link and ICS modes avoid this entirely, so Google mode can ship later behind a flag.

### 5.6 Reply intent agent

New tool: `classify_reply`.

Output:

```ts
type ReplyIntent = {
  intent: "interested" | "meeting_request" | "question" | "objection" | "referral" | "not_now" | "not_interested" | "ooo" | "unsubscribe";
  confidence: number;
  entities: {
    requestedTimes?: string[];
    timezone?: string;
    attendees?: string[];
    budget?: string;
    competitor?: string;
    question?: string;
  };
  nextAction: "reply_with_link" | "propose_slots" | "answer_question" | "route_to_human" | "suppress" | "nurture";
};
```

Use an LLM with a strict JSON schema, plus the existing regex classifier as a fast pre-filter. The regex is not thrown away; it handles OOO/unsubscribe deterministically, and the LLM handles nuance.

### 5.7 Notifications

Add `notification_events`:

```sql
notification_events (
  id text primary key,
  user_id text not null,
  workspace_id text,
  type text not null,               -- meeting_request, booking_confirmed, reply_needs_attention
  payload jsonb not null,
  read_at text,
  created_at text not null
);
```

Channels:

- In-app notification (bell/list).
- Email to `notificationEmail` (optional, user-controlled).
- Do not use a sender mailbox for user notifications; use a transactional provider or a dedicated system mailbox.

### 5.8 Safety and idempotency

- One meeting per reply thread unless the user explicitly reschedules.
- Unique index on `(reply_id)` for the first meeting; reschedules create a new row with `rescheduled_from`.
- Signed approval tokens: HMAC, expiry (24h), one-time use, tied to `meeting_id` and action.
- No booking without an explicit prospect confirmation.
- No auto-confirm by default.
- Timezone always explicit.
- Cancel/update sends `METHOD:CANCEL` with the same UID and incremented `SEQUENCE`.

### 5.9 Acceptance

- A prospect can reply "Thursday 2pm works" and receive a correct ICS invite without the user creating any account.
- A user with a Calendly link can have it sent automatically after approval.
- A user with Google connected gets a real calendar event without manual work.
- The user is notified in-app and by email when a prospect agrees.
- No duplicate invites, no timezone errors, no double-booking without approval.

---

## 6. Phase 6 — Analyst and Autonomous Optimization

### 6.1 Goal

Close the loop: measure outcomes, run experiments, and recommend or execute safe optimizations.

### 6.2 Metrics store

Add a daily rollup table:

```sql
campaign_metrics_daily (
  id text primary key,
  campaign_id text not null,
  date text not null,
  sent integer, delivered integer, opens integer, replies integer,
  positive_replies integer, meetings integer, bounces integer, complaints integer,
  variant_id text,
  persona text,
  angle text,
  created_at text not null
);
```

### 6.3 Analyst agent

Inputs: campaign metrics, experiment assignments, reply intents, meetings.

Outputs:

- Best/worst angle × persona × industry × title.
- Statistically significant variant winners.
- Deliverability warnings (bounce/complaint trend).
- Capacity warnings (mailbox saturation).
- Re-plan recommendations: pause an angle, shift mailboxes, change ICP, write a new offer.

### 6.4 Execution policy

- Low-risk actions (pause a variant, reallocate mailboxes within caps) can be auto-applied if the user enables autonomous optimization.
- High-risk actions (change ICP, launch a new campaign, increase volume) require approval.
- Every action is a traceable agent step with before/after metrics.

### 6.5 Acceptance

- Agent identifies an underperforming angle with evidence.
- Approved optimizations produce measurable lift.
- Capacity never exceeds mailbox limits.
- Every recommendation is explainable from data.

---

## 7. Phase 7 — Scale, Warmup, and Deliverability

### 7.1 Goal

Make the system trustworthy at 100M leads and at real outbound volume.

### 7.2 Lead scale

- Partition the directory by geography/industry or move to Postgres partitioned tables.
- Hybrid search: FTS for lexical, embeddings for semantic/lookalike.
- Precompute facet counts and fit scores.
- Cache hot queries and counts.
- Target: p95 search <100ms at 100M.

### 7.3 Real warmup

Current state: simulated counters. Options:

1. **Peer warmup**: exchange real emails between enrolled mailboxes, with human-like content, replies, and delays. This is what the current code pretends to do.
2. **Partner warmup**: integrate a warmup provider.
3. **Manual**: admin marks mailboxes as externally warmed and verifies DNS.

Do not inflate health scores without real sends. If warmup is simulated, label it clearly and never use it as a deliverability guarantee.

### 7.4 Deliverability telemetry

- SPF/DKIM/DMARC verification for every sender domain.
- MX and blacklist checks.
- Seed-list inbox placement tests.
- Google Postmaster Tools integration (domain reputation, spam rate).
- Bounce and complaint loops.
- Per-mailbox health based on real outcomes, not simulated counters.
- Automatic pause when bounce/complaint thresholds are breached.

### 7.5 Reliability

- Worker SLOs: 99.9% uptime, <60s tick latency.
- Queue partitioning by campaign/mailbox.
- Idempotent sends, exactly-once semantics at the job level.
- Dead-letter queue and alerting.
- Cost/latency dashboards for LLM calls.

### 7.6 Acceptance

- p95 search <100ms at 100M.
- 99.9% worker uptime.
- Bounce/complaint thresholds enforced.
- Real warmup or honest labeling.
- Cost per meeting tracked.

---

## 8. Cross-Cutting Requirements

### 8.1 Security

- Workspace isolation on every query.
- Encrypt OAuth tokens and SMTP/IMAP credentials with existing AES-256-GCM.
- Signed, expiring, one-time approval tokens.
- SSRF guard on all fetches.
- No secrets in traces.
- Rate limits on tools and LLM calls.
- Audit log for every approval and send.

### 8.2 Multi-tenancy

- Agent runs, style profiles, scheduling, and notifications are workspace-scoped.
- Contact ledger is global for safety, with workspace-level policy overrides.
- Shared mailbox pool remains admin-controlled.

### 8.3 Observability

- Run → step → tool call → AI generation trace.
- Prompt hash, model, tokens, cost, latency.
- Error taxonomy: validation, timeout, provider, policy, approval.
- Replay from any step.

### 8.4 Cost control

- Per-run budget (LLM + search/enrichment).
- Per-workspace monthly budget.
- Hard stop when exceeded.
- Cost shown in the trace and admin.

### 8.5 Failure policy

- AI failure → fail closed (no fabricated copy).
- Search/enrichment failure → continue with available evidence, mark gaps.
- Calendar failure → fall back to ICS/link.
- Sender failure → retry/health penalty (existing).
- Approval timeout → pause, do not send.

---

## 9. What Phase 1 Implements Now

Phase 1 is the foundation. The first implementation slice includes:

- `agent_runs`, `agent_steps`, `ai_generations` schema + runtime table creation.
- Typed tool registry with validation, timeouts, and sanitized tracing.
- Deterministic planner and runtime with pause/resume/retry/cancel.
- Tools: `crawl_company`, `synthesize_strategy`, `persist_gtm_run`, `get_directory_facets`, `search_leads`, `get_campaign_stats`, `check_domain_dns`.
- Integration into `analyzeWebsiteAction` with safe fallback.
- Trace page and mission-control link.
- Tests and docs.

Phases 2–7 are implemented on top of this harness, one phase at a time.

---

## 10. Open Decisions / Defaults

| Decision | Default |
|---|---|
| Planner | Deterministic for Phase 1; LLM planner in Phase 2 |
| Search provider | Configurable; no direct Google scraping |
| Email verification | Provider adapter; SMTP probe optional |
| Scheduling default | Link mode; ICS mode for zero-setup; Google optional |
| Auto-confirm meetings | Off by default |
| Auto-optimization | Off by default; low-risk actions opt-in |
| Contact frequency | 1 cold touch / 90 days / email, workspace override |
| AI failure | Fail closed |
| Trace retention | 90 days |
| Cost budget | Per-run and per-workspace ceilings |

---

## 11. Definition of Done for the Program

The program is done when:

1. A run is traceable end-to-end and replayable.
2. Research claims are evidence-backed.
3. Prospects are scored, verified, and globally deduplicated.
4. Copy is critic-scored before send.
5. Replies are classified and meetings are booked without requiring a scheduling account.
6. Experiments produce statistically valid winners.
7. The analyst can re-plan from outcomes.
8. Deliverability is measured, not simulated.
9. The public claims match the measured system.

At that point AutoGTM is an L4 autonomous GTM operator with human approval gates — not a campaign wizard.

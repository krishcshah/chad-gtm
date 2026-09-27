# SmartReach Product Map & Architecture Inventory

**Audit Run ID:** sr-audit-20260927  
**Target Environment:** Production (OCI EU-Frankfurt-1)  
**Host URL:** https://130-61-146-177.sslip.io  
**Repository Branch:** `main`  
**Target Git Commit:** `d28e3c8d9a15300647c54bf9a14ca11fbd1966b5`  
**Database:** PostgreSQL 16 (on Oracle Cloud VM `130.61.146.177`)  
**Worker / Queue:** Node.js / PM2 Process (`smartreach-worker`, `smartreach-web`)  

---

## 1. Discovered Surfaces and Capabilities

| Capability / Module | User-Facing Route / Surface | Backend Implementation | Workers / Asynchronous Jobs | Verified Status |
|---|---|---|---|---|
| **Public Landing & Spintax** | `/` | `apps/web/app/page.tsx` | N/A | **Verified Live** (Interactive mockup, pricing, donation, FAQ) |
| **Legal Compliance** | `/impressum`, `/privacy`, `/remove-my-info` | Next.js server rendered pages | PostgreSQL `data_removal_requests` table | **Verified Live** (§ 5 DDG Impressum, Art. 13/14 DSGVO, Art. 17 Erasure) |
| **Authentication & Sessions** | `/login`, `/signup`, `/api/auth/*` | Better Auth (`apps/web/lib/auth.ts`) | Session cookie management (`better-auth.session_token`) | **Verified Live** (User signup, duplicate detection, password boundary) |
| **Workspace Isolation** | Client workspace selector | `apps/web/lib/workspaces.ts` | Tenant-scoped database queries (`user_id`, `workspace_id`) | **Verified Live** (Multi-workspace switching, cross-tenant 403 gating) |
| **Sender Mailbox Connections** | `/senders`, `/senders/new` | `apps/web/lib/actions.ts:createSenderAccount` | SMTP verify, IMAP connect, AES-256-GCM encryption | **Verified Live** (M01-M06 connected, health checks, masked secrets) |
| **Lead Lists & Contacts** | `/leads`, `/leads/new`, `/leads/[id]` | `apps/web/lib/actions.ts:createLeadList` | Bulk CSV mapper, custom attributes, deduplication | **Verified Live** (Manual contacts, custom attributes, CSV upload) |
| **B2B Leads Database** | `/leads` (Explore Database tab) | `packages/database` SQLite / PG integration | 350k+ local verified B2B leads database query engine | **Verified Live** (Industry, seniority, location filters, CSV export) |
| **Campaign Sequence Builder** | `/campaigns/new`, `/campaigns/[id]` | `campaign-wizard.tsx`, `campaign-drafts.ts` | Step reordering, delay anchoring, A/B variants, draft save | **Verified Live** (3-step sequences, rotation pool, delay configuration) |
| **Sending Engine & Scheduler** | `/api/engine/tick` | `packages/email-engine/src/scheduler.ts` | PM2 `smartreach-worker` (ticks every 30s) | **Verified Live** (Daily limits, pacing, sender rotation, batch claim) |
| **SMTP Dispatch & Delivery** | Outbound SMTP | `packages/email-engine/src/processor.ts` | Nodemailer transport with connection pooling & retries | **Verified Live** (Dispatched across M01, M02, M03; received on M07, M08, M11) |
| **IMAP Sync & Reply Detection** | Inbound IMAP polling | `packages/email-engine/src/sync-replies.ts` | PM2 `smartreach-worker` (ticks every 120s) | **Verified Live** (Header threading via In-Reply-To/References) |
| **UniBox (Unified Inbox)** | `/unibox` | `apps/web/app/(app)/unibox`, `actions.ts` | Thread builder, sentiment tagging, status updater, operator reply | **Verified Live** (Multi-turn conversations, manual response dispatched via SMTP) |
| **Stop-on-Reply & Cancellation** | Inbound reply trigger | `packages/email-engine/src/sync-replies.ts:587` | Cancels pending/retry email_jobs, marks lead replied | **Verified Live** (M08 replied, future steps cancelled) |
| **Unsubscribe & Blocklist** | `/unsubscribe?token=...`, `/blocklist` | `packages/database/src/compliance.ts` | RFC 8058 List-Unsubscribe, suppression table | **Verified Live** (HMAC token validated, suppression enforced) |
| **Analytics & Metrics** | `/analytics`, `/dashboard` | `apps/web/lib/queries.ts:getAnalyticsData` | KPI aggregation (sent, opened, replied, bounced) | **Verified Live** (Charts, time range picker, metric counters) |
| **Admin Console & Governance** | `/admin` | `apps/web/app/(app)/admin` | Strictly restricted to `de.krish.shah@gmail.com` | **Verified Live** (Bug report queue, data removal requests, CSV download) |

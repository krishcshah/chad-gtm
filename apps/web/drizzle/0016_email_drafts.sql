-- Emails are written ahead of sending by the engine's drafter, not inside the
-- scheduler. Each campaign lead keeps the draft for its current step here.
-- Additive and safe to re-run. Apply BEFORE deploying the web app and the
-- engine: both select campaign_leads with select() *.
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_step" integer;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_variant_id" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_subject" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_body_text" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_body_html" text;
--> statement-breakpoint
-- drafting | ready | failed
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_status" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_retry_at" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "draft_error" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "drafted_at" text;
--> statement-breakpoint
-- Drafts per campaign (drafter look-ahead counts). Partial: only rows that
-- hold a draft, so it stays small. Building it still reads campaign_leads
-- and blocks writes to it while it builds: run this off-hours on a large
-- table, or create the index CONCURRENTLY by hand first (then this is a no-op).
CREATE INDEX IF NOT EXISTS "campaign_leads_draft_idx" ON "campaign_leads" ("campaign_id", "status", "draft_status") WHERE "draft_status" IS NOT NULL;

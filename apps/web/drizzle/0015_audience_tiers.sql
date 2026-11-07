-- Autopilot audience: every matching contact in three priority tiers,
-- provisioned in rolling batches (apps/web/lib/autopilot-audience.ts).
-- Additive and safe to re-run. Apply BEFORE deploying the web app and the
-- engine: both select these tables with select() *.

-- Sending order inside a campaign: 1 = target titles, 2 = other decision-makers,
-- 3 = everyone else. NULL (manual campaigns, older rows) sorts last.
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "priority" smallint;
--> statement-breakpoint
-- True while an Autopilot campaign still has contacts to load; the scheduler
-- never marks such a campaign completed just because its queue is empty.
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "audience_open" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Tier totals and cursors for the run's audience (AudienceState).
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "audience" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
-- Follow-ups first, then priority, then age (scheduler claim order).
CREATE INDEX IF NOT EXISTS "campaign_leads_queue_order_idx" ON "campaign_leads" ("campaign_id", "status", "step_position", "priority");

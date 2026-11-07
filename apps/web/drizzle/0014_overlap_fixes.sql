-- Overlap fixes: lead conversations (who talks to leads), per-workspace sender
-- identity and notifications, platform-level opt-outs, mailbox health, inbound
-- mail that matches no lead, and data clean-ups. Everything is additive and
-- safe to re-run. Apply BEFORE deploying the web app and the engine: both
-- select campaigns/sender_accounts with select() * and read the new columns.

-- ─── Workspaces: sender identity, notifications, lead conversations ────────
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "company_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "postal_address" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "booking_url" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "notify_email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "notify_escalations" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "notify_reminders" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
-- Workspace default for "Lead conversations": 'agent' | 'approve' | 'manual'.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "lead_conversation_mode" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "agent_paused" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "company_summary" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "main_offer" text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Copy today's account-level identity into every workspace so no running
-- campaign is held for a missing postal address.
UPDATE "workspaces" w SET "company_name" = s."company_name", "postal_address" = s."postal_address"
FROM "workspace_settings" s
WHERE s."user_id" = w."user_id" AND w."company_name" = '' AND w."postal_address" = '';
--> statement-breakpoint
-- workspace_settings is per account: deleting one workspace must not delete it.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.conname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"workspace_settings"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND c.confdeltype <> 'n' LOOP
  EXECUTE format('ALTER TABLE "workspace_settings" DROP CONSTRAINT %I', r.conname);
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"workspace_settings"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND c.confdeltype = 'n') THEN
  ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
 END IF;
END $$;
--> statement-breakpoint
UPDATE "workspace_settings" SET "workspace_id" = NULL WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
-- Legacy rows without a workspace: file them under their run's or campaign's.
UPDATE "chad_gtm_runs" r SET "workspace_id" = c."workspace_id"
FROM "campaigns" c
WHERE r."campaign_id" = c."id" AND r."workspace_id" IS NULL AND c."workspace_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "agent_requests" ar SET "workspace_id" = COALESCE(r."workspace_id", c."workspace_id")
FROM "agent_requests" x
LEFT JOIN "chad_gtm_runs" r ON r."id" = x."run_id"
LEFT JOIN "campaigns" c ON c."id" = x."campaign_id"
WHERE ar."id" = x."id" AND ar."workspace_id" IS NULL AND COALESCE(r."workspace_id", c."workspace_id") IS NOT NULL;
--> statement-breakpoint
UPDATE "agent_knowledge" k SET "workspace_id" = (
  SELECT w."id" FROM "workspaces" w WHERE w."user_id" = k."user_id" ORDER BY w."is_default" DESC, w."created_at" ASC LIMIT 1
)
WHERE k."workspace_id" IS NULL AND EXISTS (SELECT 1 FROM "workspaces" w2 WHERE w2."user_id" = k."user_id");
--> statement-breakpoint

-- ─── Campaigns ─────────────────────────────────────────────────────────────
-- Per-campaign "Lead conversations": 'default' (use workspace default) |
-- 'agent' | 'approve' | 'manual'. Added and backfilled together, once, so
-- nothing changes behaviour: Autopilot campaigns keep their run's reply mode
-- and every other existing campaign is Manual. Only new campaigns get 'default'.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'campaigns' AND column_name = 'lead_conversation_mode') THEN
  ALTER TABLE "campaigns" ADD COLUMN "lead_conversation_mode" text DEFAULT 'default' NOT NULL;
  UPDATE "campaigns" c SET "lead_conversation_mode" = CASE r."reply_agent_mode" WHEN 'approve' THEN 'approve' WHEN 'off' THEN 'manual' ELSE 'agent' END
  FROM "chad_gtm_runs" r WHERE r."campaign_id" = c."id";
  UPDATE "campaigns" SET "lead_conversation_mode" = 'manual'
  WHERE "id" NOT IN (SELECT "campaign_id" FROM "chad_gtm_runs" WHERE "campaign_id" IS NOT NULL);
 END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "agent_offer" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "send_block_reason" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "send_block_since" text;
--> statement-breakpoint
-- The engine already caps every mailbox at 30/day; store and show the truth.
ALTER TABLE "campaigns" ALTER COLUMN "max_emails_per_sender_per_day" SET DEFAULT 30;
--> statement-breakpoint
UPDATE "campaigns" SET "max_emails_per_sender_per_day" = 30 WHERE "max_emails_per_sender_per_day" > 30;
--> statement-breakpoint

-- ─── Lead conversations: who handles one lead's thread in one campaign ─────
-- No row = follow the campaign's mode. handler 'you' = the agent stays silent.
CREATE TABLE IF NOT EXISTS "lead_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"lead_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"handler" text DEFAULT 'campaign' NOT NULL,
	"handler_reason" text,
	"handler_changed_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_conversations" ADD CONSTRAINT "lead_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_conversations" ADD CONSTRAINT "lead_conversations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_conversations" ADD CONSTRAINT "lead_conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lead_conversations" ADD CONSTRAINT "lead_conversations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_conversations_lead_campaign_unique" ON "lead_conversations" USING btree ("lead_id","campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_conversations_user_idx" ON "lead_conversations" USING btree ("user_id");
--> statement-breakpoint

-- ─── Agent requests ("Needs you") ───────────────────────────────────────────
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "pending_knowledge" jsonb;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "draft_source" text DEFAULT 'agent' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "referral_email" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_requests_conversation_idx" ON "agent_requests" USING btree ("lead_id","campaign_id","status");
--> statement-breakpoint

-- ─── Inbox messages ─────────────────────────────────────────────────────────
-- true on an agent message a person approved ("Agent, approved by you").
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "approved_by_user" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Inbox messages sent from a pool mailbox were filed under the mailbox's
-- (admin's) workspace; file them under the lead's workspace instead.
UPDATE "unibox_messages" um SET "workspace_id" = l."workspace_id"
FROM "leads" l, "sender_accounts" s
WHERE um."lead_id" = l."id" AND um."sender_id" = s."id" AND s."is_system_pool" = true
  AND um."user_id" = l."user_id" AND um."workspace_id" IS DISTINCT FROM l."workspace_id";
--> statement-breakpoint

-- ─── Replies ────────────────────────────────────────────────────────────────
-- Who set replies.tag: 'human' | 'auto'. NULL with a tag = automatic (legacy).
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "tag_source" text;
--> statement-breakpoint
UPDATE "replies" SET "agent_status" = 'held'
WHERE "agent_status" = 'escalated'
  AND "agent_summary" LIKE 'Held: this account is not approved%'
  AND NOT EXISTS (SELECT 1 FROM "agent_requests" ar WHERE ar."reply_id" = "replies"."id" AND ar."status" = 'open');
--> statement-breakpoint

-- ─── Users ──────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approval_revoked_at" timestamp with time zone;
--> statement-breakpoint
-- Unapproved accounts that once started a campaign were revoked, not new.
UPDATE "users" u SET "approval_revoked_at" = now()
WHERE u."approval_revoked_at" IS NULL AND u."approved_at" IS NULL AND u."role" <> 'admin'
  AND EXISTS (SELECT 1 FROM "campaigns" c WHERE c."user_id" = u."id" AND c."started_at" IS NOT NULL);
--> statement-breakpoint

-- ─── Lowercase stored email addresses ───────────────────────────────────────
-- Skip a row when the lowercased address already exists in the same list (or
-- when a sibling row with a lower id will take it), so no duplicate is made.
UPDATE "leads" l SET "email" = lower(trim(l."email")), "updated_at" = to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')
WHERE l."email" <> lower(trim(l."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "leads" d
    WHERE d."list_id" = l."list_id" AND d."email" = lower(trim(l."email"))
      AND d."deleted_at" IS NOT DISTINCT FROM l."deleted_at" AND d."id" <> l."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "leads" s
    WHERE s."list_id" = l."list_id" AND lower(trim(s."email")) = lower(trim(l."email"))
      AND s."email" <> lower(trim(s."email"))
      AND s."deleted_at" IS NOT DISTINCT FROM l."deleted_at" AND s."id" < l."id"
  );
--> statement-breakpoint
UPDATE "email_jobs" SET "to_email" = lower(trim("to_email")) WHERE "to_email" <> lower(trim("to_email"));
--> statement-breakpoint

-- ─── Suppressions: opt-outs outlive workspaces and accounts ────────────────
ALTER TABLE "suppressions" ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.conname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"suppressions"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND c.confdeltype <> 'n' LOOP
  EXECUTE format('ALTER TABLE "suppressions" DROP CONSTRAINT %I', r.conname);
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"suppressions"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND c.confdeltype = 'n') THEN
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
 END IF;
END $$;
--> statement-breakpoint
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT c.conname FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"suppressions"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND c.confdeltype <> 'n' LOOP
  EXECUTE format('ALTER TABLE "suppressions" DROP CONSTRAINT %I', r.conname);
 END LOOP;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"suppressions"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND c.confdeltype = 'n') THEN
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
 END IF;
END $$;
--> statement-breakpoint
-- Leads marked Blocked or Unsubscribed by hand were never added to the block list.
INSERT INTO "suppressions" ("id", "user_id", "workspace_id", "value", "kind", "reason", "source")
SELECT gen_random_uuid()::text, x."user_id", x."workspace_id", x."value", 'email', 'Marked Blocked on a lead', 'manual'
FROM (
  SELECT DISTINCT ON (l."user_id", lower(trim(l."email"))) l."user_id", l."workspace_id", lower(trim(l."email")) AS "value"
  FROM "leads" l
  WHERE l."status" = 'blocked' AND l."deleted_at" IS NULL AND trim(l."email") <> ''
  ORDER BY l."user_id", lower(trim(l."email")), l."created_at"
) x
ON CONFLICT ("user_id", "value") DO NOTHING;
--> statement-breakpoint
INSERT INTO "suppressions" ("id", "user_id", "workspace_id", "value", "kind", "reason", "source")
SELECT gen_random_uuid()::text, x."user_id", x."workspace_id", x."value", 'email', 'Marked Unsubscribed on a lead', 'manual'
FROM (
  SELECT DISTINCT ON (l."user_id", lower(trim(l."email"))) l."user_id", l."workspace_id", lower(trim(l."email")) AS "value"
  FROM "leads" l
  WHERE l."status" = 'unsubscribed' AND l."deleted_at" IS NULL AND trim(l."email") <> ''
  ORDER BY l."user_id", lower(trim(l."email")), l."created_at"
) x
ON CONFLICT ("user_id", "value") DO NOTHING;
--> statement-breakpoint
UPDATE "suppressions" SET "source" = 'not_interested' WHERE "source" = 'manual' AND "reason" = 'Replied not interested';
--> statement-breakpoint
-- Permanent ledger of who was contacted when (survives account deletion; no FKs).
CREATE TABLE IF NOT EXISTS "contact_history" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"contacted_at" text NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_history_email_idx" ON "contact_history" USING btree ("email","contacted_at");
--> statement-breakpoint

-- ─── Autopilot runs ─────────────────────────────────────────────────────────
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "launch_started_at" text;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "dismissed_at" text;
--> statement-breakpoint

-- ─── Mailboxes ──────────────────────────────────────────────────────────────
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_fail_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_attempted_at" text;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "failed_reason" text;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "last_retest_at" text;
--> statement-breakpoint
-- The shared pool belongs to no workspace, so deleting one cannot cascade into it.
UPDATE "sender_accounts" SET "workspace_id" = NULL WHERE "is_system_pool" = true AND "workspace_id" IS NOT NULL;
--> statement-breakpoint

-- ─── Inbound mail that matches no lead (or several owners) ─────────────────
CREATE TABLE IF NOT EXISTS "unmatched_inbound" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"message_id" text,
	"from_email" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"received_at" text NOT NULL,
	"candidate_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text DEFAULT 'no_match' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_user_id" text,
	"reply_id" text,
	"resolved_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unmatched_inbound" ADD CONSTRAINT "unmatched_inbound_sender_id_sender_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unmatched_inbound" ADD CONSTRAINT "unmatched_inbound_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unmatched_inbound" ADD CONSTRAINT "unmatched_inbound_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unmatched_inbound_sender_message_unique" ON "unmatched_inbound" USING btree ("sender_id","message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unmatched_inbound_status_received_idx" ON "unmatched_inbound" USING btree ("status","received_at");
--> statement-breakpoint

-- ─── Templates: tell user templates from Autopilot's own ───────────────────
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
UPDATE "email_templates" t SET "source" = 'autopilot'
WHERE t."source" <> 'autopilot'
  AND (EXISTS (SELECT 1 FROM "campaigns" c JOIN "chad_gtm_runs" r ON r."campaign_id" = c."id" WHERE c."template_id" = t."id")
    OR t."name" LIKE '% Calibrated Template');

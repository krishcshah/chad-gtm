-- Schema parity + reply agent.
-- Brings every table/column that used to be created lazily at runtime into the
-- migration history, and adds the reply-agent tables. Every statement is
-- idempotent so this is safe on databases that already self-healed.
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"campaign_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"kind" text DEFAULT 'resource' NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"url" text,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"run_id" text,
	"campaign_id" text,
	"reply_id" text,
	"lead_id" text,
	"kind" text DEFAULT 'question' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"question" text DEFAULT '' NOT NULL,
	"lead_email" text DEFAULT '' NOT NULL,
	"lead_name" text DEFAULT '' NOT NULL,
	"lead_company" text DEFAULT '' NOT NULL,
	"draft_reply" text DEFAULT '' NOT NULL,
	"resolution" text,
	"resource_url" text,
	"notified_at" text,
	"resolved_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"kind" text DEFAULT 'gtm_analysis' NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"phase" text DEFAULT 'intake' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"budget_cents" integer,
	"started_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"finished_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"seq" integer NOT NULL,
	"agent" text DEFAULT 'orchestrator' NOT NULL,
	"tool" text,
	"status" text DEFAULT 'running' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"latency_ms" integer,
	"tokens" integer,
	"cost_micros" integer,
	"started_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"finished_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text,
	"step_id" text,
	"user_id" text NOT NULL,
	"purpose" text DEFAULT 'email' NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"prompt_hash" text,
	"prompt" text,
	"response" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_micros" integer,
	"latency_ms" integer,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "b2b_database_access" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_session_id" text,
	"amount_cents" integer DEFAULT 9900 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'stripe_checkout' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_email" text NOT NULL,
	"user_name" text,
	"workspace_id" text,
	"category" text DEFAULT 'bug_report' NOT NULL,
	"heading" text NOT NULL,
	"description" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"step_position" integer DEFAULT 1 NOT NULL,
	"scheduled_for" text,
	"sent_at" text,
	"last_error" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_senders" (
	"campaign_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	CONSTRAINT "campaign_senders_campaign_id_sender_id_pk" PRIMARY KEY("campaign_id","sender_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"lead_list_id" text,
	"template_id" text,
	"wizard_step" integer,
	"scheduled_at" text,
	"business_days_only" boolean DEFAULT false NOT NULL,
	"sending_timezone" text DEFAULT 'UTC' NOT NULL,
	"sending_window_start" text DEFAULT '09:00' NOT NULL,
	"sending_window_end" text DEFAULT '17:00' NOT NULL,
	"daily_limit" integer DEFAULT 100 NOT NULL,
	"min_delay_sec" integer DEFAULT 90 NOT NULL,
	"max_delay_sec" integer DEFAULT 240 NOT NULL,
	"max_emails_per_sender_per_day" integer DEFAULT 50 NOT NULL,
	"stop_on_reply" boolean DEFAULT true NOT NULL,
	"retry_failed" boolean DEFAULT true NOT NULL,
	"retry_count" integer DEFAULT 3 NOT NULL,
	"track_opens" boolean DEFAULT true NOT NULL,
	"last_sender_idx" integer DEFAULT 0 NOT NULL,
	"sender_cap_until" text,
	"started_at" text,
	"completed_at" text,
	"deleted_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chad_gtm_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"url" text NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'analyzing' NOT NULL,
	"business_overview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"icp_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"daily_email_limit" integer DEFAULT 30 NOT NULL,
	"campaign_id" text,
	"agent_run_id" text,
	"booking_url" text,
	"autopilot" boolean DEFAULT false NOT NULL,
	"reply_agent_mode" text DEFAULT 'autopilot' NOT NULL,
	"approved_email_samples" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calibration_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_removal_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"contact_email" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"campaign_lead_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"step_position" integer DEFAULT 1 NOT NULL,
	"sequence_step_id" text,
	"variant_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"scheduled_for" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"message_id" text,
	"sent_at" text,
	"processing_at" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'text' NOT NULL,
	"deleted_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_tracking_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"campaign_id" text,
	"job_id" text,
	"lead_id" text,
	"type" text NOT NULL,
	"target_url" text,
	"ip" text,
	"user_agent" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"name" text NOT NULL,
	"deleted_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"list_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"website" text,
	"linkedin" text,
	"job_title" text,
	"location" text,
	"phone" text,
	"industry" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"deleted_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"path" text NOT NULL,
	"page_title" text,
	"referrer" text,
	"user_agent" text,
	"ip_address" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "replies" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"lead_id" text,
	"campaign_id" text,
	"from_name" text DEFAULT '' NOT NULL,
	"from_email" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"message_id" text,
	"received_at" text NOT NULL,
	"read_at" text,
	"tag" text,
	"agent_status" text,
	"agent_intent" text,
	"agent_summary" text,
	"agent_handled_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sender_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"sender_name" text NOT NULL,
	"email" text NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer DEFAULT 587 NOT NULL,
	"smtp_username" text NOT NULL,
	"smtp_password_enc" text NOT NULL,
	"smtp_security" text DEFAULT 'tls' NOT NULL,
	"imap_host" text DEFAULT '' NOT NULL,
	"imap_port" integer DEFAULT 993 NOT NULL,
	"imap_username" text DEFAULT '' NOT NULL,
	"imap_password_enc" text DEFAULT '' NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"hourly_limit" integer DEFAULT 10 NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"reply_to" text DEFAULT '' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"signature" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"health" integer DEFAULT 100 NOT NULL,
	"smtp_status" text DEFAULT 'untested' NOT NULL,
	"imap_status" text DEFAULT 'untested' NOT NULL,
	"last_sync_at" text,
	"replied_count" integer DEFAULT 0 NOT NULL,
	"is_system_pool" boolean DEFAULT false NOT NULL,
	"deleted_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_step_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"step_id" text NOT NULL,
	"label" text DEFAULT 'A' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"paused_at" text,
	"ai_generate_on_the_fly" boolean DEFAULT false NOT NULL,
	"ai_prompt" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"position" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'initial' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_checkout_session_id" text,
	"status" text DEFAULT 'trialing' NOT NULL,
	"plan" text DEFAULT 'lifetime_trial' NOT NULL,
	"current_period_end" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "support_ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"user_email" text NOT NULL,
	"sender_role" text DEFAULT 'user' NOT NULL,
	"message" text NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"value" text NOT NULL,
	"kind" text DEFAULT 'email' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unibox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text,
	"reply_id" text,
	"lead_id" text,
	"campaign_id" text,
	"sender_id" text,
	"direction" text DEFAULT 'operator' NOT NULL,
	"from_role" text DEFAULT 'operator' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"subject" text,
	"body_text" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"sent_at" text NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_counters" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"date" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"company_name" text DEFAULT '' NOT NULL,
	"postal_address" text DEFAULT '' NOT NULL,
	"unsubscribe_base_url" text DEFAULT '' NOT NULL,
	"ai_api_key_enc" text,
	"ai_provider" text DEFAULT 'google' NOT NULL,
	"ai_model" text DEFAULT 'gemini-3.8-flash' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "type" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "message" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "meta" jsonb DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'resource' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "content" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "url" text;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "usage_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "run_id" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "reply_id" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "lead_id" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'question' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "title" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "question" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "lead_email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "lead_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "lead_company" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "draft_reply" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "resolution" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "resource_url" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "notified_at" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "resolved_at" text;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_requests" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'gtm_analysis' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "goal" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'running' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "phase" text DEFAULT 'intake' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "input" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "state" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "error" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "budget_cents" integer;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "started_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "finished_at" text;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "run_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "seq" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "agent" text DEFAULT 'orchestrator' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "tool" text;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'running' NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "input" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "output" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "error" text;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "tokens" integer;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "cost_micros" integer;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "started_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "finished_at" text;
--> statement-breakpoint
ALTER TABLE "agent_steps" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "run_id" text;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "step_id" text;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "purpose" text DEFAULT 'email' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'google' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "model" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "prompt_hash" text;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "prompt" text;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "response" text;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "tokens_in" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "tokens_out" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "cost_micros" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "latency_ms" integer;
--> statement-breakpoint
ALTER TABLE "ai_generations" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "stripe_session_id" text;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "amount_cents" integer DEFAULT 9900 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'stripe_checkout' NOT NULL;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "b2b_database_access" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "user_email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "user_name" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "category" text DEFAULT 'bug_report' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "heading" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "description" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "url" text;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "campaign_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "lead_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'queued' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "step_position" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "scheduled_for" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "sent_at" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_senders" ADD COLUMN IF NOT EXISTS "campaign_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_senders" ADD COLUMN IF NOT EXISTS "sender_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaign_senders" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "lead_list_id" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "template_id" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "wizard_step" integer;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "scheduled_at" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "business_days_only" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "sending_timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "sending_window_start" text DEFAULT '09:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "sending_window_end" text DEFAULT '17:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "daily_limit" integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "min_delay_sec" integer DEFAULT 90 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "max_delay_sec" integer DEFAULT 240 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "max_emails_per_sender_per_day" integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "stop_on_reply" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "retry_failed" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "retry_count" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "track_opens" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "last_sender_idx" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "sender_cap_until" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "started_at" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "completed_at" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "url" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "company_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'analyzing' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "business_overview" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "icp_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "offers" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "selected_industries" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "daily_email_limit" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "agent_run_id" text;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "booking_url" text;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "autopilot" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "reply_agent_mode" text DEFAULT 'autopilot' NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "approved_email_samples" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "calibration_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_removal_requests" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
ALTER TABLE "data_removal_requests" ADD COLUMN IF NOT EXISTS "contact_email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_removal_requests" ADD COLUMN IF NOT EXISTS "description" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_removal_requests" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_removal_requests" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "data_removal_requests" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "campaign_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "campaign_lead_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "sender_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "lead_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "to_email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "subject" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "body_text" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "body_html" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "step_position" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "sequence_step_id" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "variant_id" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "scheduled_for" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "max_attempts" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "last_error" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "message_id" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "sent_at" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "processing_at" text;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "dry_run" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "subject" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "body_text" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "body_html" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "format" text DEFAULT 'text' NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "job_id" text;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "lead_id" text;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "type" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "target_url" text;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "ip" text;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "user_agent" text;
--> statement-breakpoint
ALTER TABLE "email_tracking_events" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_tags" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_tags" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_tags" ADD COLUMN IF NOT EXISTS "color" text DEFAULT '#6366f1' NOT NULL;
--> statement-breakpoint
ALTER TABLE "lead_tags" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "list_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "first_name" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_name" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "website" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "linkedin" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "job_title" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "location" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "industry" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'new' NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "user_id" text;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "path" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "page_title" text;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "referrer" text;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "user_agent" text;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "ip_address" text;
--> statement-breakpoint
ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "sender_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "lead_id" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "from_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "from_email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "subject" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "snippet" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "body_text" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "body_html" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "message_id" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "received_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "read_at" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "tag" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "agent_status" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "agent_intent" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "agent_summary" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "agent_handled_at" text;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "sender_name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "smtp_host" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "smtp_port" integer DEFAULT 587 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "smtp_username" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "smtp_password_enc" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "smtp_security" text DEFAULT 'tls' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_host" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_port" integer DEFAULT 993 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_username" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_password_enc" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "daily_limit" integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "hourly_limit" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "from_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "reply_to" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "signature" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "health" integer DEFAULT 100 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "smtp_status" text DEFAULT 'untested' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "imap_status" text DEFAULT 'untested' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "last_sync_at" text;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "replied_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "is_system_pool" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "deleted_at" text;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "step_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "label" text DEFAULT 'A' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "subject" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "body_html" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "body_text" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "weight" integer DEFAULT 50 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "paused_at" text;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_generate_on_the_fly" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN IF NOT EXISTS "campaign_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN IF NOT EXISTS "position" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN IF NOT EXISTS "delay_days" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN IF NOT EXISTS "type" text DEFAULT 'initial' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_customer_id" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'trialing' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "plan" text DEFAULT 'lifetime_trial' NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "current_period_end" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "ticket_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "user_name" text;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "user_email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "sender_role" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "message" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "value" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'email' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "reason" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "reply_id" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "lead_id" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "campaign_id" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "sender_id" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "direction" text DEFAULT 'operator' NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "from_role" text DEFAULT 'operator' NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "from_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "from_email" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "subject" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "body_text" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "body_html" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "sent_at" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "entity_type" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "entity_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "date" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "usage_counters" ADD COLUMN IF NOT EXISTS "count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "company_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "postal_address" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "unsubscribe_base_url" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_api_key_enc" text;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_provider" text DEFAULT 'google' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_model" text DEFAULT 'gemini-3.8-flash' NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "account_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "provider_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "access_token" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "refresh_token" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "id_token" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "access_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "refresh_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "scope" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "password" text;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "token" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "ip_address" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_agent" text;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "image" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "identifier" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "value" text NOT NULL;
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone NOT NULL;
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ALTER COLUMN "ai_model" SET DEFAULT 'gemini-3.8-flash';
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "activity_logs_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"activity_logs"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_knowledge_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_knowledge"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_knowledge_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_knowledge"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_requests_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_requests"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_requests_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_requests"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_requests_run_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_requests"') AND c.confrelid = to_regclass('"public"."chad_gtm_runs"') AND cardinality(c.conkey) = 1 AND a.attname = 'run_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_run_id_chad_gtm_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chad_gtm_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_requests_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_requests"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_requests_reply_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_requests"') AND c.confrelid = to_regclass('"public"."replies"') AND cardinality(c.conkey) = 1 AND a.attname = 'reply_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_requests_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_requests"') AND c.confrelid = to_regclass('"public"."leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_requests" ADD CONSTRAINT "agent_requests_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_runs_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_runs"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_runs_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_runs"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "agent_steps_run_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"agent_steps"') AND c.confrelid = to_regclass('"public"."agent_runs"') AND cardinality(c.conkey) = 1 AND a.attname = 'run_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "ai_generations_run_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"ai_generations"') AND c.confrelid = to_regclass('"public"."agent_runs"') AND cardinality(c.conkey) = 1 AND a.attname = 'run_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "ai_generations_step_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"ai_generations"') AND c.confrelid = to_regclass('"public"."agent_steps"') AND cardinality(c.conkey) = 1 AND a.attname = 'step_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_step_id_agent_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."agent_steps"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "ai_generations_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"ai_generations"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "b2b_database_access_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"b2b_database_access"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "b2b_database_access" ADD CONSTRAINT "b2b_database_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "support_tickets_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"support_tickets"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "support_tickets_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"support_tickets"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaign_leads_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaign_leads"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaign_leads_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaign_leads"') AND c.confrelid = to_regclass('"public"."leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaign_senders_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaign_senders"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaign_senders" ADD CONSTRAINT "campaign_senders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaign_senders_sender_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaign_senders"') AND c.confrelid = to_regclass('"public"."sender_accounts"') AND cardinality(c.conkey) = 1 AND a.attname = 'sender_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaign_senders" ADD CONSTRAINT "campaign_senders_sender_id_sender_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaigns_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaigns"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaigns_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaigns"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaigns_lead_list_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaigns"') AND c.confrelid = to_regclass('"public"."lead_lists"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_list_id' AND ra.attname = 'id' AND c.confdeltype = 'r' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_lead_list_id_lead_lists_id_fk" FOREIGN KEY ("lead_list_id") REFERENCES "public"."lead_lists"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "campaigns_template_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"campaigns"') AND c.confrelid = to_regclass('"public"."email_templates"') AND cardinality(c.conkey) = 1 AND a.attname = 'template_id' AND ra.attname = 'id' AND c.confdeltype = 'r' AND c.confupdtype = 'a') THEN
  ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "chad_gtm_runs_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"chad_gtm_runs"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "chad_gtm_runs" ADD CONSTRAINT "chad_gtm_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "chad_gtm_runs_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"chad_gtm_runs"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "chad_gtm_runs" ADD CONSTRAINT "chad_gtm_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "chad_gtm_runs_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"chad_gtm_runs"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "chad_gtm_runs" ADD CONSTRAINT "chad_gtm_runs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "data_removal_requests_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"data_removal_requests"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "data_removal_requests" ADD CONSTRAINT "data_removal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_jobs_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_jobs"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_jobs_campaign_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_jobs"') AND c.confrelid = to_regclass('"public"."campaign_leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_lead_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_campaign_lead_id_campaign_leads_id_fk" FOREIGN KEY ("campaign_lead_id") REFERENCES "public"."campaign_leads"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_jobs_sender_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_jobs"') AND c.confrelid = to_regclass('"public"."sender_accounts"') AND cardinality(c.conkey) = 1 AND a.attname = 'sender_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_sender_id_sender_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_jobs_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_jobs"') AND c.confrelid = to_regclass('"public"."leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_templates_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_templates"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_tracking_events_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_tracking_events"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_tracking_events" ADD CONSTRAINT "email_tracking_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_tracking_events_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_tracking_events"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_tracking_events" ADD CONSTRAINT "email_tracking_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_tracking_events_job_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_tracking_events"') AND c.confrelid = to_regclass('"public"."email_jobs"') AND cardinality(c.conkey) = 1 AND a.attname = 'job_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_tracking_events" ADD CONSTRAINT "email_tracking_events_job_id_email_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."email_jobs"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "email_tracking_events_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"email_tracking_events"') AND c.confrelid = to_regclass('"public"."leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "email_tracking_events" ADD CONSTRAINT "email_tracking_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "lead_lists_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"lead_lists"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "lead_lists_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"lead_lists"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "lead_tags_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"lead_tags"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "leads_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"leads"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "leads_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"leads"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "leads_list_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"leads"') AND c.confrelid = to_regclass('"public"."lead_lists"') AND cardinality(c.conkey) = 1 AND a.attname = 'list_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_list_id_lead_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lead_lists"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "page_views_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"page_views"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "page_views" ADD CONSTRAINT "page_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "page_views_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"page_views"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "page_views" ADD CONSTRAINT "page_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "replies_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"replies"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "replies" ADD CONSTRAINT "replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "replies_sender_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"replies"') AND c.confrelid = to_regclass('"public"."sender_accounts"') AND cardinality(c.conkey) = 1 AND a.attname = 'sender_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "replies" ADD CONSTRAINT "replies_sender_id_sender_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender_accounts"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "replies_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"replies"') AND c.confrelid = to_regclass('"public"."leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "replies" ADD CONSTRAINT "replies_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "replies_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"replies"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "replies" ADD CONSTRAINT "replies_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "sender_accounts_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"sender_accounts"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "sender_accounts_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"sender_accounts"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "sequence_step_variants_step_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"sequence_step_variants"') AND c.confrelid = to_regclass('"public"."sequence_steps"') AND cardinality(c.conkey) = 1 AND a.attname = 'step_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "sequence_step_variants" ADD CONSTRAINT "sequence_step_variants_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "sequence_steps_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"sequence_steps"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "subscriptions_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"subscriptions"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "support_ticket_messages_ticket_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"support_ticket_messages"') AND c.confrelid = to_regclass('"public"."support_tickets"') AND cardinality(c.conkey) = 1 AND a.attname = 'ticket_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "support_ticket_messages_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"support_ticket_messages"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "suppressions_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"suppressions"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "suppressions_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"suppressions"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "unibox_messages_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"unibox_messages"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "unibox_messages_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"unibox_messages"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "unibox_messages_reply_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"unibox_messages"') AND c.confrelid = to_regclass('"public"."replies"') AND cardinality(c.conkey) = 1 AND a.attname = 'reply_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "unibox_messages_lead_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"unibox_messages"') AND c.confrelid = to_regclass('"public"."leads"') AND cardinality(c.conkey) = 1 AND a.attname = 'lead_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "unibox_messages_campaign_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"unibox_messages"') AND c.confrelid = to_regclass('"public"."campaigns"') AND cardinality(c.conkey) = 1 AND a.attname = 'campaign_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "unibox_messages_sender_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"unibox_messages"') AND c.confrelid = to_regclass('"public"."sender_accounts"') AND cardinality(c.conkey) = 1 AND a.attname = 'sender_id' AND ra.attname = 'id' AND c.confdeltype = 'n' AND c.confupdtype = 'a') THEN
  ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_sender_id_sender_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender_accounts"("id") ON DELETE set null ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "usage_counters_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"usage_counters"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "workspace_settings_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"workspace_settings"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "workspace_settings_workspace_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"workspace_settings"') AND c.confrelid = to_regclass('"public"."workspaces"') AND cardinality(c.conkey) = 1 AND a.attname = 'workspace_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "workspaces_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"workspaces"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "accounts_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"accounts"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
 -- Skip when an equivalent FK already exists under another name (e.g. the "sessions_user_id_fkey" a runtime self-heal created).
 IF NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1] JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1] WHERE c.contype = 'f' AND c.conrelid = to_regclass('"sessions"') AND c.confrelid = to_regclass('"public"."users"') AND cardinality(c.conkey) = 1 AND a.attname = 'user_id' AND ra.attname = 'id' AND c.confdeltype = 'c' AND c.confupdtype = 'a') THEN
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
 END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_logs_user_idx" ON "activity_logs" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_knowledge_user_idx" ON "agent_knowledge" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_knowledge_workspace_idx" ON "agent_knowledge" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_requests_user_status_idx" ON "agent_requests" USING btree ("user_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_requests_workspace_idx" ON "agent_requests" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_requests_reply_idx" ON "agent_requests" USING btree ("reply_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_workspace_idx" ON "agent_runs" USING btree ("workspace_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" USING btree ("status","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_steps_run_seq_unique" ON "agent_steps" USING btree ("run_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_steps_run_idx" ON "agent_steps" USING btree ("run_id","seq");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generations_run_idx" ON "ai_generations" USING btree ("run_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generations_user_idx" ON "ai_generations" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "b2b_database_access_user_idx" ON "b2b_database_access" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "b2b_database_access_status_idx" ON "b2b_database_access" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_user_idx" ON "support_tickets" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_created_idx" ON "support_tickets" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_status_idx" ON "support_tickets" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_category_idx" ON "support_tickets" USING btree ("category");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_leads_campaign_lead_unique" ON "campaign_leads" USING btree ("campaign_id","lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_leads_sched_idx" ON "campaign_leads" USING btree ("campaign_id","status","scheduled_for");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_leads_lead_idx" ON "campaign_leads" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_senders_sender_idx" ON "campaign_senders" USING btree ("sender_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_user_idx" ON "campaigns" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_workspace_idx" ON "campaigns" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_due_idx" ON "campaigns" USING btree ("status","scheduled_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chad_gtm_runs_user_idx" ON "chad_gtm_runs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chad_gtm_runs_workspace_idx" ON "chad_gtm_runs" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chad_gtm_runs_status_idx" ON "chad_gtm_runs" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chad_gtm_runs_campaign_idx" ON "chad_gtm_runs" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_removal_user_idx" ON "data_removal_requests" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_removal_email_idx" ON "data_removal_requests" USING btree ("contact_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_removal_status_idx" ON "data_removal_requests" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_removal_created_idx" ON "data_removal_requests" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_jobs_campaign_lead_step_unique" ON "email_jobs" USING btree ("campaign_lead_id","step_position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_jobs_poll_idx" ON "email_jobs" USING btree ("status","scheduled_for","dry_run");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_jobs_sender_idx" ON "email_jobs" USING btree ("sender_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_jobs_campaign_idx" ON "email_jobs" USING btree ("campaign_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_jobs_recovery_idx" ON "email_jobs" USING btree ("status","processing_at","dry_run");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_templates_user_idx" ON "email_templates" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_tracking_user_type_idx" ON "email_tracking_events" USING btree ("user_id","type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_tracking_campaign_type_idx" ON "email_tracking_events" USING btree ("campaign_id","type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_tracking_job_idx" ON "email_tracking_events" USING btree ("job_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_lists_user_idx" ON "lead_lists" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_lists_workspace_idx" ON "lead_lists" USING btree ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_lists_user_name_active_unique" ON "lead_lists" USING btree ("user_id","name","deleted_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_tags_user_name_unique" ON "lead_tags" USING btree ("user_id","name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_user_idx" ON "leads" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_workspace_idx" ON "leads" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_list_idx" ON "leads" USING btree ("list_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_status_idx" ON "leads" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_email_idx" ON "leads" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_cursor_idx" ON "leads" USING btree ("created_at","id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "leads_list_email_active_unique" ON "leads" USING btree ("list_id","email","deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_views_user_idx" ON "page_views" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_views_path_idx" ON "page_views" USING btree ("path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_views_created_at_idx" ON "page_views" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_views_user_created_idx" ON "page_views" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replies_agent_status_idx" ON "replies" USING btree ("agent_status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "replies_message_unique" ON "replies" USING btree ("sender_id","message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replies_user_idx" ON "replies" USING btree ("user_id","received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replies_lead_idx" ON "replies" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "replies_tag_idx" ON "replies" USING btree ("tag");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sender_accounts_user_idx" ON "sender_accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sender_accounts_workspace_idx" ON "sender_accounts" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sender_accounts_status_idx" ON "sender_accounts" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sender_accounts_pool_idx" ON "sender_accounts" USING btree ("is_system_pool");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sender_accounts_user_email_active_unique" ON "sender_accounts" USING btree ("user_id","email","deleted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_step_variants_step_idx" ON "sequence_step_variants" USING btree ("step_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sequence_step_variants_step_label_unique" ON "sequence_step_variants" USING btree ("step_id","label");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sequence_steps_campaign_position_unique" ON "sequence_steps" USING btree ("campaign_id","position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequence_steps_campaign_idx" ON "sequence_steps" USING btree ("campaign_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_unique" ON "subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_messages_created_idx" ON "support_ticket_messages" USING btree ("created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppressions_user_value_unique" ON "suppressions" USING btree ("user_id","value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppressions_user_idx" ON "suppressions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppressions_workspace_idx" ON "suppressions" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppressions_value_idx" ON "suppressions" USING btree ("value");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unibox_messages_user_sent_idx" ON "unibox_messages" USING btree ("user_id","sent_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unibox_messages_workspace_idx" ON "unibox_messages" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unibox_messages_reply_idx" ON "unibox_messages" USING btree ("reply_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unibox_messages_lead_campaign_idx" ON "unibox_messages" USING btree ("lead_id","campaign_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_counters_unique" ON "usage_counters" USING btree ("entity_type","entity_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_counters_user_idx" ON "usage_counters" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_user_idx" ON "workspaces" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_idx" ON "accounts" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" USING btree ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_unique" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verifications_identifier_idx" ON "verifications" USING btree ("identifier");

-- Launch hardening: account approval, admin by role, agent retry, engine heartbeat.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
-- Existing accounts predate the approval gate: treat them as approved.
UPDATE "users" SET "approved_at" = "created_at" WHERE "approved_at" IS NULL AND "created_at" < '2026-11-07T00:00:00Z';
--> statement-breakpoint
-- Admin is now role-based. Promote the accounts that were admins via the old
-- hard-coded email list, but only if they already existed before this change
-- (a fresh sign-up with one of those addresses must not become admin).
UPDATE "users" SET "role" = 'admin'
WHERE lower("email") IN ('de.krish.shah@gmail.com', 'krish@leadskingdom.co')
  AND "created_at" < '2026-11-07T00:00:00Z'
  AND "role" <> 'admin';
--> statement-breakpoint
UPDATE "users" SET "approved_at" = COALESCE("approved_at", now()) WHERE "role" = 'admin';
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "agent_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "replies" ADD COLUMN IF NOT EXISTS "agent_claimed_at" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "engine_heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"last_tick_at" text NOT NULL,
	"last_ok_at" text,
	"last_error" text,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
-- Email verification is now enforced at sign-in. Accounts created before this
-- release never received a verification email, so mark them verified to avoid
-- locking them out. New sign-ups must verify.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false AND "created_at" < '2026-11-07T00:00:00Z';

-- Launch hardening: account approval, admin by role, agent retry, engine heartbeat.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
-- Accounts created under the old code were never reviewed. Approve only the
-- ones with a campaign that is sending (running or scheduled) when this runs,
-- so a live client is not cut off; admins are approved below. Everyone else
-- (unknown sign-ups, test fixtures with passwords in the public repo) waits
-- for an admin in /admin. No date cutoff, so a late deploy behaves the same.
UPDATE "users" SET "approved_at" = COALESCE("created_at", now())
WHERE "approved_at" IS NULL
  AND "id" IN (SELECT "user_id" FROM "campaigns" WHERE "status" IN ('running', 'scheduled'));
--> statement-breakpoint
-- Admin is now role-based. Promote the accounts that were admins via the old
-- hard-coded email list, but only if they already existed before this change
-- (a fresh sign-up with one of those addresses must not become admin). This is
-- the only statement that keeps a fixed cutoff: it is a security boundary, not
-- a backfill. The cutoff is the day production was checked: neither address
-- had a newer account then. Later admins: scripts/make-admin.ts.
UPDATE "users" SET "role" = 'admin'
WHERE lower("email") IN ('de.krish.shah@gmail.com', 'krish@leadskingdom.co')
  AND "created_at" < '2026-11-06T00:00:00Z'
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
-- Email verification is now enforced at sign-in. Every account that exists
-- when this migration runs was created without a verification email, so mark
-- it verified to avoid locking it out (no date cutoff). New sign-ups must verify.
-- Exception: an unpromoted account on one of the old hard-coded admin
-- addresses could be a squatter (the old code made that address admin
-- unverified), and a verified address in ADMIN_EMAILS grants admin. It stays
-- unverified until its owner verifies it.
UPDATE "users" SET "email_verified" = true
WHERE "email_verified" = false
  AND NOT (lower("email") IN ('de.krish.shah@gmail.com', 'krish@leadskingdom.co') AND "role" <> 'admin');

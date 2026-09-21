DROP INDEX "email_jobs_poll_idx";--> statement-breakpoint
DROP INDEX "email_jobs_recovery_idx";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "sending_window_start" SET DEFAULT '00:00';--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "sending_window_end" SET DEFAULT '00:00';--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN "dry_run" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "email_jobs_poll_idx" ON "email_jobs" USING btree ("status","scheduled_for","dry_run");--> statement-breakpoint
CREATE INDEX "email_jobs_recovery_idx" ON "email_jobs" USING btree ("status","processing_at","dry_run");
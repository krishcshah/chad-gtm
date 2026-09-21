ALTER TABLE "campaigns" ALTER COLUMN "lead_list_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "template_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "wizard_step" integer;--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "sending_window_start" SET DEFAULT '09:00';--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "sending_window_end" SET DEFAULT '17:00';

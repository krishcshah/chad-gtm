ALTER TABLE "campaign_leads" ADD COLUMN "step_position" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN "step_position" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN "sequence_step_id" text;--> statement-breakpoint
ALTER TABLE "email_jobs" ADD COLUMN "variant_id" text;--> statement-breakpoint
ALTER TABLE "email_jobs" DROP CONSTRAINT IF EXISTS "email_jobs_campaign_lead_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "email_jobs_campaign_lead_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "email_jobs_campaign_lead_step_unique" ON "email_jobs" USING btree ("campaign_lead_id","step_position");--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"position" integer NOT NULL,
	"delay_days" integer DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'initial' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequence_step_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"step_id" text NOT NULL,
	"label" text DEFAULT 'A' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"weight" integer DEFAULT 50 NOT NULL,
	"paused_at" text,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_step_variants" ADD CONSTRAINT "sequence_step_variants_step_id_sequence_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_steps_campaign_position_unique" ON "sequence_steps" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE INDEX "sequence_steps_campaign_idx" ON "sequence_steps" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "sequence_step_variants_step_idx" ON "sequence_step_variants" USING btree ("step_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sequence_step_variants_step_label_unique" ON "sequence_step_variants" USING btree ("step_id","label");

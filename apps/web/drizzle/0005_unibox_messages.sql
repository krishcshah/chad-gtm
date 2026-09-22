CREATE TABLE "unibox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
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
ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_reply_id_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "public"."replies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_sender_id_sender_accounts_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."sender_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unibox_messages_user_sent_idx" ON "unibox_messages" USING btree ("user_id","sent_at");--> statement-breakpoint
CREATE INDEX "unibox_messages_reply_idx" ON "unibox_messages" USING btree ("reply_id");--> statement-breakpoint
CREATE INDEX "unibox_messages_lead_campaign_idx" ON "unibox_messages" USING btree ("lead_id","campaign_id");

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
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_user_idx" ON "workspaces" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "lead_lists" ADD CONSTRAINT "lead_lists_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_lists_workspace_idx" ON "lead_lists" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_workspace_idx" ON "leads" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "sender_accounts" ADD CONSTRAINT "sender_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sender_accounts_workspace_idx" ON "sender_accounts" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_workspace_idx" ON "campaigns" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppressions_workspace_idx" ON "suppressions" USING btree ("workspace_id");
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "unibox_messages" ADD CONSTRAINT "unibox_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unibox_messages_workspace_idx" ON "unibox_messages" USING btree ("workspace_id");

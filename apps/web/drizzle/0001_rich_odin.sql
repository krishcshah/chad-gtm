CREATE TABLE "suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"value" text NOT NULL,
	"kind" text DEFAULT 'email' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"company_name" text DEFAULT '' NOT NULL,
	"postal_address" text DEFAULT '' NOT NULL,
	"unsubscribe_base_url" text DEFAULT '' NOT NULL,
	"created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
	"updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppressions_user_value_unique" ON "suppressions" USING btree ("user_id","value");--> statement-breakpoint
CREATE INDEX "suppressions_user_idx" ON "suppressions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "suppressions_value_idx" ON "suppressions" USING btree ("value");
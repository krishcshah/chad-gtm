ALTER TABLE "replies" ADD COLUMN "tag" text;
--> statement-breakpoint
CREATE INDEX "replies_tag_idx" ON "replies" USING btree ("tag");

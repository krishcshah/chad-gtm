-- Align leads.status to F03d enum (column already exists).
-- Map legacy values → new | contacted | replied | bounced | unsubscribed | blocked.
UPDATE "leads" SET "status" = CASE
  WHEN "status" IN ('pending', 'queued') THEN 'new'
  WHEN "status" IN ('sent', 'completed', 'failed') THEN 'contacted'
  WHEN "status" = 'replied' THEN 'replied'
  WHEN "status" = 'bounced' THEN 'bounced'
  WHEN "status" IN ('unsubscribed', 'blocked', 'new', 'contacted') THEN "status"
  ELSE 'new'
END;
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "status" SET DEFAULT 'new';

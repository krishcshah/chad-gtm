ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_generate_on_the_fly" boolean DEFAULT false NOT NULL;
ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_api_key_enc" text;
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_provider" text DEFAULT 'google' NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_model" text DEFAULT 'gemini-2.5-flash' NOT NULL;

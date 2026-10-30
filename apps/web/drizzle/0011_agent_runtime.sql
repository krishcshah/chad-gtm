-- Agent runtime: durable runs, typed steps, and LLM generation traces.
-- Runtime self-heals these tables via ensureAgentTables(); this migration is
-- the canonical schema for fresh databases and drizzle-kit users.

CREATE TABLE IF NOT EXISTS "agent_runs" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "workspace_id" text REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind" text NOT NULL DEFAULT 'gtm_analysis',
  "goal" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'running',
  "phase" text NOT NULL DEFAULT 'intake',
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "budget_cents" integer,
  "started_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'),
  "finished_at" text,
  "created_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'),
  "updated_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')
);

CREATE INDEX IF NOT EXISTS "agent_runs_user_idx" ON "agent_runs" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runs_workspace_idx" ON "agent_runs" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "agent_runs_status_idx" ON "agent_runs" ("status", "updated_at");

CREATE TABLE IF NOT EXISTS "agent_steps" (
  "id" text PRIMARY KEY,
  "run_id" text NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "agent" text NOT NULL DEFAULT 'orchestrator',
  "tool" text,
  "status" text NOT NULL DEFAULT 'running',
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error" text,
  "latency_ms" integer,
  "tokens" integer,
  "cost_micros" integer,
  "started_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'),
  "finished_at" text,
  "created_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_steps_run_seq_unique" ON "agent_steps" ("run_id", "seq");
CREATE INDEX IF NOT EXISTS "agent_steps_run_idx" ON "agent_steps" ("run_id", "seq");

CREATE TABLE IF NOT EXISTS "ai_generations" (
  "id" text PRIMARY KEY,
  "run_id" text REFERENCES "agent_runs"("id") ON DELETE SET NULL,
  "step_id" text REFERENCES "agent_steps"("id") ON DELETE SET NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL DEFAULT 'email',
  "provider" text NOT NULL DEFAULT 'google',
  "model" text NOT NULL DEFAULT '',
  "prompt_hash" text,
  "prompt" text,
  "response" text,
  "tokens_in" integer,
  "tokens_out" integer,
  "cost_micros" integer,
  "latency_ms" integer,
  "created_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')
);

CREATE INDEX IF NOT EXISTS "ai_generations_run_idx" ON "ai_generations" ("run_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_generations_user_idx" ON "ai_generations" ("user_id", "created_at");

ALTER TABLE "chad_gtm_runs" ADD COLUMN IF NOT EXISTS "agent_run_id" text;

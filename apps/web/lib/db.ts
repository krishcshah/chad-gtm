import { createDb } from "@smartreach/database/connection";
import { schema } from "@smartreach/database";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { env, isDbConfigured } from "./env";

/**
 * Typed as Neon HTTP for call-site inference. At runtime createDb() may use
 * node-postgres for local TCP Postgres — the Drizzle query API is the same.
 */
export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;
let migrated = false;

export async function ensureAiColumns(db: Db) {
  if (migrated) return;
  try {
    await db.execute(
      sql`ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_generate_on_the_fly" boolean DEFAULT false NOT NULL`
    );
    await db.execute(
      sql`ALTER TABLE "sequence_step_variants" ADD COLUMN IF NOT EXISTS "ai_prompt" text DEFAULT '' NOT NULL`
    );
    await db.execute(
      sql`ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_api_key_enc" text`
    );
    await db.execute(
      sql`ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_provider" text DEFAULT 'google' NOT NULL`
    );
    await db.execute(
      sql`ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "ai_model" text DEFAULT 'gemini-3.8-flash' NOT NULL`
    );
    await db.execute(
      sql`UPDATE "workspace_settings" SET "ai_model" = 'gemini-3.8-flash' WHERE "ai_model" IN ('gemini-2.5-flash', 'gemini-1.5-pro', 'gpt-4o', 'gpt-4o-mini')`
    );
    migrated = true;
  } catch (err) {
    console.error("[db] ensureAiColumns error:", err);
  }
}

let chadGtmMigrated = false;
export async function ensureChadGtmTables(db: Db) {
  if (chadGtmMigrated) return;
  try {
    await db.execute(
      sql`ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "is_system_pool" boolean DEFAULT false NOT NULL`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "sender_accounts_pool_idx" ON "sender_accounts" ("is_system_pool")`
    );
    await db.execute(
      sql`CREATE TABLE IF NOT EXISTS "chad_gtm_runs" (
        "id" text PRIMARY KEY,
        "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "workspace_id" text REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "url" text NOT NULL,
        "company_name" text NOT NULL DEFAULT '',
        "status" text NOT NULL DEFAULT 'analyzing',
        "business_overview" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "icp_profile" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "offers" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "selected_industries" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "daily_email_limit" integer NOT NULL DEFAULT 30,
        "campaign_id" text REFERENCES "campaigns"("id") ON DELETE SET NULL,
        "approved_email_samples" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ'),
        "updated_at" text NOT NULL DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')
      )`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "chad_gtm_runs_user_idx" ON "chad_gtm_runs" ("user_id")`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "chad_gtm_runs_workspace_idx" ON "chad_gtm_runs" ("workspace_id")`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "chad_gtm_runs_status_idx" ON "chad_gtm_runs" ("status")`
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS "chad_gtm_runs_campaign_idx" ON "chad_gtm_runs" ("campaign_id")`
    );
    chadGtmMigrated = true;
  } catch (err) {
    console.error("[db] ensureChadGtmTables error:", err);
  }
}

export function getDb(): Db {
  if (!cached) {
    if (!isDbConfigured) throw new Error("DATABASE_URL is not configured");
    cached = createDb(env.DATABASE_URL).db as Db;
  }
  return cached;
}

/**
 * Drizzle handle that opens the client on first property access.
 * Safe to hand to libraries that capture a db at import time (better-auth).
 * A missing DATABASE_URL still throws from `getDb()` when a query actually runs.
 */
export function lazyDb(): Db {
  return new Proxy({} as Db, {
    get(_target, prop, receiver) {
      const db = getDb();
      const value = Reflect.get(db as object, prop, receiver);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(db) : value;
    },
  });
}

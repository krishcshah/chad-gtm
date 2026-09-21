import { createDb } from "@smartreach/database/connection";
import { schema } from "@smartreach/database";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { env, isDbConfigured } from "./env";

/**
 * Typed as Neon HTTP for call-site inference. At runtime createDb() may use
 * node-postgres for local TCP Postgres — the Drizzle query API is the same.
 */
export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null = null;

export function getDb(): Db {
  if (!cached) {
    if (!isDbConfigured) throw new Error("DATABASE_URL is not configured");
    cached = createDb(env.DATABASE_URL).db as Db;
  }
  return cached;
}

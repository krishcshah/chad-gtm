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

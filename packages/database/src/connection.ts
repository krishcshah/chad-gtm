/**
 * Driver selection: local TCP Postgres → node-postgres; Neon / remote → neon-http.
 * Typed loosely to avoid duplicate @types/pg / drizzle generic friction across workspaces.
 */
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

/** Opaque Drizzle client — call sites treat EngineDb / Db as any. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SmartReachDb = any;

function isLocalPostgres(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1";
  } catch {
    return /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  }
}

export function createDb(url: string): { db: SmartReachDb; close?: () => Promise<void> } {
  if (isLocalPostgres(url)) {
    const pool = new pg.Pool({ connectionString: url });
    // Cast: nested @types/pg copies disagree on PoolClient signatures.
    const db = drizzlePg(pool as any, { schema });
    return {
      db,
      close: async () => {
        await pool.end();
      },
    };
  }
  const db = drizzleNeon(neon(url) as any, { schema });
  return { db };
}

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

function isStandardPostgres(url: string): boolean {
  return !url.includes("neon.tech");
}

export function createDb(rawUrl: string): { db: SmartReachDb; close?: () => Promise<void> } {
  const url = (rawUrl || "").trim().replace(/^["']|["']$/g, "");
  if (isStandardPostgres(url)) {
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

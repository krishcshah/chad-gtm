/**
 * Apply Drizzle SQL migrations against DATABASE_URL (local TCP Postgres or Neon).
 * Uses node-postgres — Neon HTTP cannot speak plain local Postgres.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, "..", ".env.local") });
config({ path: path.join(here, "..", "..", "..", ".env") });

const url: string = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

const migrationsFolder = path.join(here, "..", "drizzle");

async function main() {
  const pool = new pg.Pool({ connectionString: url });
  try {
    // Cast around nested @types/pg duplicates in the monorepo.
    const db = drizzle(pool as any);
    console.log(`[migrate] applying migrations from ${migrationsFolder}`);
    console.log(`[migrate] target ${url.replace(/:[^:@/]+@/, ":***@")}`);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] ok");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});

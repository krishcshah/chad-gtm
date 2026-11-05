/**
 * Apply Drizzle SQL migrations against DATABASE_URL (local TCP Postgres or Neon).
 * Uses node-postgres — Neon HTTP cannot speak plain local Postgres.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, "..", ".env.local") });
config({ path: path.join(here, "..", "..", "..", ".env") });
config({ path: path.join(here, "..", "..", "..", ".env.production.local") });

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
    await baselineLegacyDatabase(pool);
    await migrate(db, { migrationsFolder });
    console.log("[migrate] ok");
  } finally {
    await pool.end();
  }
}

/**
 * Databases that were built by the app's runtime self-healing (or by hand)
 * have every table but no drizzle history, so replaying 0000 would fail on
 * "relation already exists". Record history up to the last non-idempotent
 * migration; everything after it (0010+) is written with IF NOT EXISTS and
 * brings the schema to full parity.
 */
const BASELINE_TAG = "0009_workspaces";

async function baselineLegacyDatabase(pool: pg.Pool) {
  const { rows } = await pool.query(
    `SELECT to_regclass('public.users') AS users, to_regclass('drizzle.__drizzle_migrations') AS history`,
  );
  if (!rows[0]?.users || rows[0]?.history) return;

  const migrations = readMigrationFiles({ migrationsFolder });
  const journal = JSON.parse(
    (await import("node:fs")).readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string; when: number }> };
  const baseline = journal.entries.find((e) => e.tag === BASELINE_TAG);
  const baselineMigration = migrations.find((m) => m.folderMillis === baseline?.when);
  if (!baseline || !baselineMigration) throw new Error(`[migrate] baseline ${BASELINE_TAG} not found`);

  console.log(`[migrate] existing schema without history — baselining at ${BASELINE_TAG}`);
  await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
  );
  await pool.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [
    baselineMigration.hash,
    baseline.when,
  ]);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});

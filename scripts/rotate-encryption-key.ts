/**
 * Re-encrypt every secret stored with packages/database/src/crypto.ts from
 * OLD_ENCRYPTION_KEY to NEW_ENCRYPTION_KEY, in one transaction.
 *
 *   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... npx tsx scripts/rotate-encryption-key.ts           # dry run
 *   OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... npx tsx scripts/rotate-encryption-key.ts --apply   # write
 *
 * Columns: see ENCRYPTED_COLUMNS in packages/database/src/key-rotation.ts.
 *
 * - Dry run by default: decrypts every value with the old key, re-encrypts and
 *   verifies under the new key, prints counts, and rolls back.
 * - Refuses to write if any value fails to decrypt. Values that were never
 *   encrypted (e.g. demo placeholders) also block, unless --leave-malformed.
 * - Values already under the new key are left alone, so a re-run is safe.
 * - DATABASE_URL comes from the environment, else from apps/web/.env.local.
 *   It is never printed, and neither are keys or decrypted values.
 *
 * Stop chadgtm-worker before --apply and restart everything with the new key
 * right after (docs/OPERATIONS.md, "Rotating ENCRYPTION_KEY").
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseDotenv } from "dotenv";
import pg from "pg";
import {
  blockingProblems,
  decryptWithKey,
  ENCRYPTED_COLUMNS,
  mergePlans,
  planTableRotation,
  validateRotationKeys,
  type EncryptedColumnTarget,
  type RotationPlan,
} from "../packages/database/src/key-rotation";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const args = new Set(process.argv.slice(2));
if (args.has("--help") || args.has("-h")) {
  console.log(
    "Usage: OLD_ENCRYPTION_KEY=... NEW_ENCRYPTION_KEY=... npx tsx scripts/rotate-encryption-key.ts [--apply] [--leave-malformed]",
  );
  process.exit(0);
}
const unknown = [...args].filter((a) => !["--apply", "--leave-malformed", "--dry-run"].includes(a));
if (unknown.length) {
  console.error(`[rotate] unknown argument(s): ${unknown.join(" ")}`);
  process.exit(2);
}
const apply = args.has("--apply") && !args.has("--dry-run");
const leaveMalformed = args.has("--leave-malformed");

function databaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/^["']|["']$/g, "");
  const file = path.join(repoRoot, "apps", "web", ".env.local");
  if (fs.existsSync(file)) {
    const parsed = parseDotenv(fs.readFileSync(file));
    if (parsed.DATABASE_URL) return parsed.DATABASE_URL.trim();
  }
  return "";
}

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function existingColumns(client: pg.PoolClient, target: EncryptedColumnTarget): Promise<string[]> {
  const { rows } = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [target.table],
  );
  const present = new Set(rows.map((r) => r.column_name));
  return target.columns.filter((c) => present.has(c));
}

function printPlan(plan: RotationPlan) {
  console.table(
    plan.stats.map((s) => ({
      column: `${s.table}.${s.column}`,
      rows: s.rows,
      empty: s.empty,
      rotate: s.rotated,
      already_new: s.alreadyNew,
      malformed: s.malformed,
      failed: s.failed,
    })),
  );
}

async function main() {
  let keys: ReturnType<typeof validateRotationKeys>;
  try {
    keys = validateRotationKeys(process.env.OLD_ENCRYPTION_KEY, process.env.NEW_ENCRYPTION_KEY);
  } catch (err) {
    console.error(`[rotate] ${(err as Error).message}`);
    process.exit(2);
  }
  const url = databaseUrl();
  if (!url) {
    console.error("[rotate] DATABASE_URL is not set (env or apps/web/.env.local)");
    process.exit(2);
  }

  console.log(`[rotate] mode: ${apply ? "APPLY (will write)" : "dry run (no writes)"}`);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`[rotate] cannot connect to the database: ${(err as Error).message}`);
    await pool.end().catch(() => {});
    process.exitCode = 1;
    return;
  }
  let exitCode = 0;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");

    const plans: RotationPlan[] = [];
    for (const declared of ENCRYPTED_COLUMNS) {
      const columns = await existingColumns(client, declared);
      if (columns.length === 0) {
        console.log(`[rotate] ${declared.table}: table/columns not present, skipping`);
        continue;
      }
      const target = { ...declared, columns };
      const { rows } = await client.query<Record<string, unknown>>(
        `SELECT ${[target.idColumn, ...columns].map(ident).join(", ")} FROM ${ident(target.table)} FOR UPDATE`,
      );
      plans.push(planTableRotation(target, rows, keys.oldKey, keys.newKey));
    }
    const plan = mergePlans(plans);
    printPlan(plan);

    const blocking = blockingProblems(plan, leaveMalformed);
    if (plan.problems.length) {
      console.log("[rotate] values that are not readable with OLD_ENCRYPTION_KEY:");
      for (const p of plan.problems) console.log(`  ${p.table}.${p.column} ${p.id}: ${p.outcome} (${p.reason})`);
    }
    if (blocking.length) {
      console.error(
        `[rotate] REFUSING: ${blocking.length} value(s) cannot be rotated. Nothing was changed.` +
          (blocking.every((p) => p.outcome === "malformed")
            ? " These were never encrypted; re-run with --leave-malformed to keep them as they are."
            : " Check OLD_ENCRYPTION_KEY (it must be the key the running app uses)."),
      );
      await client.query("ROLLBACK");
      exitCode = 1;
      return;
    }

    if (!apply) {
      await client.query("ROLLBACK");
      console.log(`[rotate] dry run ok: ${plan.updates.length} value(s) would be re-encrypted. Re-run with --apply.`);
      return;
    }

    for (const u of plan.updates) {
      const res = await client.query(
        `UPDATE ${ident(u.table)} SET ${ident(u.column)} = $1 WHERE ${ident(u.idColumn)} = $2`,
        [u.value, u.id],
      );
      if (res.rowCount !== 1) throw new Error(`update of ${u.table}.${u.column} ${u.id} touched ${res.rowCount} rows`);
    }

    // Verify inside the transaction: every rotated cell now reads with the new key.
    for (const u of plan.updates) {
      const { rows } = await client.query<Record<string, string>>(
        `SELECT ${ident(u.column)} AS v FROM ${ident(u.table)} WHERE ${ident(u.idColumn)} = $1`,
        [u.id],
      );
      decryptWithKey(rows[0]?.v ?? "", keys.newKey);
    }

    await client.query("COMMIT");
    console.log(`[rotate] committed: ${plan.updates.length} value(s) re-encrypted with NEW_ENCRYPTION_KEY.`);
    console.log("[rotate] Now set ENCRYPTION_KEY to the new key in BOTH env files and restart chadgtm-web and chadgtm-worker.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[rotate] failed, rolled back: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    process.exitCode = exitCode;
  }
}

void main();

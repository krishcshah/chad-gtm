import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";

const here = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.join(here, "..", "..", "..", "..", "apps", "web", "drizzle");

const journal = JSON.parse(readFileSync(path.join(drizzleDir, "meta", "_journal.json"), "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};
const sqlFiles = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).sort();
const allSql = sqlFiles.map((f) => readFileSync(path.join(drizzleDir, f), "utf8")).join("\n");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** True when some migration creates `table` with `column`, or adds it later. */
function migrationHasColumn(table: string, column: string): boolean {
  const added = new RegExp(
    `ALTER TABLE "${esc(table)}" ADD COLUMN (IF NOT EXISTS )?"${esc(column)}"`,
  );
  if (added.test(allSql)) return true;
  const create = new RegExp(`CREATE TABLE (IF NOT EXISTS )?"${esc(table)}" \\(([\\s\\S]*?)\\n\\);`, "g");
  for (const m of allSql.matchAll(create)) {
    if (new RegExp(`^\\s*"${esc(column)}" `, "m").test(m[2])) return true;
  }
  return false;
}

describe("drizzle migrations", () => {
  it("journal lists every migration file, in order", () => {
    expect(journal.entries.map((e) => `${e.tag}.sql`)).toEqual(sqlFiles);
    journal.entries.forEach((e, i) => expect(e.idx).toBe(i));
  });

  it("every schema column exists in some migration", () => {
    const missing: string[] = [];
    for (const value of Object.values(schema)) {
      if (!(value instanceof PgTable)) continue;
      const cfg = getTableConfig(value);
      for (const col of cfg.columns) {
        if (!migrationHasColumn(cfg.name, col.name)) missing.push(`${cfg.name}.${col.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("0014 keeps existing campaigns on their current reply behaviour", () => {
    const sql = readFileSync(path.join(drizzleDir, "0014_overlap_fixes.sql"), "utf8");
    // Added and backfilled in one guarded block, so a re-run never resets choices.
    expect(sql).toMatch(
      /IF NOT EXISTS \(SELECT 1 FROM information_schema\.columns[^\n]*'lead_conversation_mode'\) THEN\s+ALTER TABLE "campaigns" ADD COLUMN "lead_conversation_mode"/,
    );
    expect(sql).toContain(`WHEN 'approve' THEN 'approve' WHEN 'off' THEN 'manual' ELSE 'agent' END`);
    expect(sql).toContain(`SET "lead_conversation_mode" = 'manual'`);
    // Opt-outs must outlive their owner.
    expect(sql).toContain(`ALTER TABLE "suppressions" ALTER COLUMN "user_id" DROP NOT NULL`);
    expect(sql).toMatch(/"suppressions_user_id_users_id_fk"[^;]*ON DELETE SET NULL/);
    expect(sql).toMatch(/"suppressions_workspace_id_workspaces_id_fk"[^;]*ON DELETE SET NULL/);
  });
});

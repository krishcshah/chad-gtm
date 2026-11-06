import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(__dirname, "..", "..", "drizzle", "0013_launch_hardening.sql"), "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

function statement(match: RegExp): string {
  const found = statements.filter((s) => match.test(s));
  expect(found).toHaveLength(1);
  return found[0];
}

describe("migration 0013 backfills", () => {
  it("approves every account that exists at migration time (no date cutoff)", () => {
    const s = statement(/SET "approved_at" = COALESCE\("created_at"/);
    expect(s).not.toMatch(/created_at"\s*</);
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("marks every existing account verified (no date cutoff)", () => {
    const s = statement(/SET "email_verified" = true/);
    expect(s).not.toMatch(/created_at/);
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("keeps the hard-coded cutoff only on the legacy admin promotion", () => {
    const s = statement(/SET "role" = 'admin'/);
    expect(s).toMatch(/"created_at" < '2026-11-07T00:00:00Z'/);
    const withDates = statements.filter((x) => /\d{4}-\d{2}-\d{2}T/.test(x));
    expect(withDates).toEqual([s]);
  });
});

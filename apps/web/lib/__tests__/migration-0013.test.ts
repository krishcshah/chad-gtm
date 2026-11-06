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
  it("approves only accounts with a sending campaign (no date cutoff)", () => {
    const s = statement(/SET "approved_at" = COALESCE\("created_at"/);
    expect(s).toMatch(/FROM "campaigns" WHERE "status" IN \('running', 'scheduled'\)/);
    expect(s).not.toMatch(/created_at"\s*</);
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("marks existing accounts verified (no date cutoff), except unpromoted legacy admin addresses", () => {
    const s = statement(/SET "email_verified" = true/);
    expect(s).not.toMatch(/created_at/);
    expect(s).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(s).toMatch(/AND NOT \(lower\("email"\) IN \('de\.krish\.shah@gmail\.com', 'krish@leadskingdom\.co'\) AND "role" <> 'admin'\)/);
    // Must run after the promotion, so a promoted legacy admin is still verified.
    const order = statements.findIndex((x) => /SET "role" = 'admin'/.test(x));
    expect(statements.findIndex((x) => x === s)).toBeGreaterThan(order);
  });

  it("keeps the hard-coded cutoff only on the legacy admin promotion", () => {
    const s = statement(/SET "role" = 'admin'/);
    expect(s).toMatch(/"created_at" < '2026-11-06T00:00:00Z'/);
    const withDates = statements.filter((x) => /\d{4}-\d{2}-\d{2}T/.test(x));
    expect(withDates).toEqual([s]);
  });
});

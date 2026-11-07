import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/* Rolling out "Lead conversations" must not change who answers any existing
 * campaign: Autopilot campaigns keep their run's reply mode, every other
 * existing campaign becomes Manual, and only new campaigns follow the
 * workspace default. */

const sql = fs.readFileSync(path.join(__dirname, "..", "..", "drizzle", "0014_overlap_fixes.sql"), "utf8");
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
  return found[0]!;
}

describe("migration 0014: campaigns.lead_conversation_mode", () => {
  const block = statement(/ADD COLUMN "lead_conversation_mode" text DEFAULT 'default'/);

  it("adds the column with 'default' for new campaigns", () => {
    expect(block).toMatch(/ALTER TABLE "campaigns" ADD COLUMN "lead_conversation_mode" text DEFAULT 'default' NOT NULL/);
  });

  it("sets run-linked campaigns from the run's reply_agent_mode", () => {
    expect(block).toMatch(
      /UPDATE "campaigns" c SET "lead_conversation_mode" = CASE r\."reply_agent_mode" WHEN 'approve' THEN 'approve' WHEN 'off' THEN 'manual' ELSE 'agent' END\s+FROM "chad_gtm_runs" r WHERE r\."campaign_id" = c\."id"/,
    );
  });

  it("sets every other existing campaign to Manual", () => {
    expect(block).toMatch(
      /UPDATE "campaigns" SET "lead_conversation_mode" = 'manual'\s+WHERE "id" NOT IN \(SELECT "campaign_id" FROM "chad_gtm_runs" WHERE "campaign_id" IS NOT NULL\)/,
    );
  });

  it("adds and backfills in one guarded block, run-linked update first", () => {
    const add = block.indexOf('ADD COLUMN "lead_conversation_mode"');
    const fromRun = block.indexOf("CASE r.\"reply_agent_mode\"");
    const manual = block.indexOf("SET \"lead_conversation_mode\" = 'manual'");
    expect(block).toMatch(/IF NOT EXISTS \(SELECT 1 FROM information_schema\.columns/);
    expect(add).toBeGreaterThan(-1);
    expect(fromRun).toBeGreaterThan(add);
    expect(manual).toBeGreaterThan(fromRun);
  });

  it("no other statement touches the column (no unguarded ADD COLUMN IF NOT EXISTS that would skip the backfill)", () => {
    const others = statements.filter((s) => s !== block && /"campaigns"[\s\S]*"lead_conversation_mode"/.test(s));
    expect(others).toEqual([]);
  });

  it("the workspace default starts at Manual", () => {
    statement(/ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "lead_conversation_mode" text DEFAULT 'manual' NOT NULL/);
  });
});

describe("the app never adds the column at runtime", () => {
  it("db.ts has no runtime ALTER for campaigns.lead_conversation_mode (it would skip the backfill)", () => {
    const dbTs = fs.readFileSync(path.join(__dirname, "..", "db.ts"), "utf8");
    expect(dbTs).not.toMatch(/campaigns[\s\S]{0,80}lead_conversation_mode/);
  });
});

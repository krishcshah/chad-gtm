import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { missingListLeadsCountSql, missingListLeadsWhere } from "../lead-sendability";

const render = (w: unknown) => new PgDialect().sqlToQuery(w as never);
const SINCE = "2026-08-09T00:00:00.000Z";
const opts = { ownerId: "u1", campaignId: "c1", leadListId: "list-1", since: SINCE };

describe("missingListLeadsWhere (#40 'Add N new leads')", () => {
  it("takes only 'new' leads of the list, with the #31 snapshot rules", () => {
    const q = render(missingListLeadsWhere(opts));
    expect(q.params).toEqual(expect.arrayContaining(["list-1", "new", "u1", "c1", SINCE]));
    expect(q.params).not.toContain("contacted");
    // No two live sequences to one person; 90-day per-owner cooldown.
    expect(q.sql).toContain("\"sendability_other_campaign_lead\".\"status\" in ('queued', 'scheduled')");
    expect(q.sql).toContain('"sendability_other_campaign_lead"."created_at" >=');
  });

  it("leaves out blocklisted addresses and domains", () => {
    const q = render(missingListLeadsWhere(opts));
    expect(q.sql).toContain('from "suppressions"');
    expect(q.sql).toContain(`split_part("leads"."email", '@', 2)`);
  });

  it("leaves out an address the campaign already has (any lead row)", () => {
    const q = render(missingListLeadsWhere(opts));
    expect(q.sql).toContain('inner join "leads" as snapshot_other_lead on snapshot_other_lead.id = "campaign_leads"."lead_id"');
    expect(q.sql).toContain('lower(snapshot_other_lead.email) = lower("leads"."email")');
  });

  it("the button's count counts each address once, like the action's dedupe", () => {
    const q = render(missingListLeadsCountSql(missingListLeadsWhere(opts)));
    expect(q.sql).toContain('count(distinct lower(trim("leads"."email")))');
    expect(q.params).toEqual(expect.arrayContaining(["list-1", "new", "c1"]));
  });
});

import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { contactCooldownSince, listSendabilityCounts, snapshotLeadWhere } from "../lead-sendability";

const render = (w: unknown) => new PgDialect().sqlToQuery(w as never);
const SINCE = "2026-08-09T00:00:00.000Z";
const COOLDOWN = '"sendability_other_campaign_lead"."created_at" >=';

describe("snapshotLeadWhere", () => {
  it("by default: only 'new' leads, and none your other campaigns took in during the last 90 days", () => {
    const q = render(snapshotLeadWhere({ ownerId: "u1", campaignId: "c1", reengageContacted: false, since: SINCE }));
    expect(q.params).toContain("new");
    expect(q.params).not.toContain("contacted");
    expect(q.sql).toContain(COOLDOWN);
    expect(q.params).toContain(SINCE);
    expect(q.params).toContain("u1");
    // The campaign's own rows never count against it.
    expect(q.sql).toContain('"sendability_other_campaign"."id" <>');
    expect(q.params).toContain("c1");
    expect(q.sql).toContain('"leads"."deleted_at" is null');
  });

  it("re-engaging drops the 90-day rule and allows 'contacted'", () => {
    const q = render(snapshotLeadWhere({ ownerId: "u1", campaignId: "c1", reengageContacted: true, since: SINCE }));
    expect(q.params).toEqual(expect.arrayContaining(["new", "contacted"]));
    expect(q.sql).not.toContain(COOLDOWN);
    expect(q.params).not.toContain(SINCE);
  });

  it("never lets one person be in two live sequences, in both modes", () => {
    for (const reengageContacted of [false, true]) {
      const q = render(snapshotLeadWhere({ ownerId: "u1", campaignId: null, reengageContacted, since: SINCE }));
      expect(q.sql).toMatch(/not exists \(select 1 from "campaign_leads" "sendability_other_campaign_lead"/);
      expect(q.sql).toContain('"sendability_other_lead"."email" = "leads"."email"');
      expect(q.sql).toContain('"sendability_other_campaign"."deleted_at" is null');
      expect(q.sql).toContain("\"sendability_other_campaign_lead\".\"status\" in ('queued', 'scheduled')");
      expect(q.params).toEqual(expect.arrayContaining(["running", "scheduled", "paused"]));
    }
  });

  it("contactCooldownSince is 90 days back", () => {
    expect(contactCooldownSince(new Date("2026-11-07T00:00:00.000Z"))).toBe(SINCE);
  });
});

describe("listSendabilityCounts", () => {
  it("returns sendable and the extra leads re-engaging would add, per list", async () => {
    let selected: Record<string, unknown> | undefined;
    const db: any = {
      select: (shape: Record<string, unknown>) => {
        selected = shape;
        const chain: any = {
          from: () => chain,
          where: () => chain,
          groupBy: async () => [
            { listId: "list-1", sendable: "3", reengage: "5" },
            { listId: "list-2", sendable: 0, reengage: 0 },
          ],
        };
        return chain;
      },
    };
    const out = await listSendabilityCounts(db, "u1", ["list-1", "list-2"]);
    expect(out.get("list-1")).toEqual({ sendable: 3, contacted: 2 });
    expect(out.get("list-2")).toEqual({ sendable: 0, contacted: 0 });
    const sendable = render(selected!.sendable);
    // Suppressed people (yours, or anyone's opt-out) are never counted as sendable.
    expect(sendable.sql).toContain('from "suppressions"');
    expect(sendable.params).toEqual(expect.arrayContaining(["unsubscribe", "bounce", "complaint", "erasure"]));
  });

  it("skips the query when there are no lists", async () => {
    const db: any = { select: () => { throw new Error("should not query"); } };
    expect((await listSendabilityCounts(db, "u1", [])).size).toBe(0);
  });
});

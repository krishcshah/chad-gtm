import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  buildAnalyticsSummary,
  campaignRates,
  computeAnalyticsRates,
  eachDateInclusive,
  leadsEmailedSql,
  repliedLeadsSql,
  toDateKey,
  type CampaignTotals,
} from "../analytics";

describe("F13a analytics rates + empty range", () => {
  it("empty / zero contacted → rates 0", () => {
    const empty = buildAnalyticsSummary({
      leadsContacted: 0,
      replyCount: 0,
      bounceCount: 0,
      openCount: 0,
      clickCount: 0,
    });
    expect(empty).toEqual({
      leadsContacted: 0,
      replyCount: 0,
      bounceCount: 0,
      openCount: 0,
      clickCount: 0,
      replyRate: 0,
      bounceRate: 0,
      openRate: 0,
      clickRate: 0,
    });

    const withNoise = computeAnalyticsRates(0, 5, 2, 3, 1);
    expect(withNoise.replyRate).toBe(0);
    expect(withNoise.bounceRate).toBe(0);
    expect(withNoise.openRate).toBe(0);
    expect(withNoise.clickRate).toBe(0);
  });

  it("rate math: replyRate, bounceRate, openRate, clickRate are percent 0–100", () => {
    const s = buildAnalyticsSummary({
      leadsContacted: 10,
      replyCount: 2,
      bounceCount: 1,
      openCount: 6,
      clickCount: 3,
    });
    expect(s.replyRate).toBe(20);
    expect(s.bounceRate).toBe(10);
    expect(s.openRate).toBe(60);
    expect(s.clickRate).toBe(30);
  });

  it("live tracking rates calculate accurately with open and click counts", () => {
    const rates = computeAnalyticsRates(100, 25, 5, 75, 40);
    expect(rates.openRate).toBe(75);
    expect(rates.clickRate).toBe(40);
    expect(rates.replyRate).toBe(25);
    expect(rates.bounceRate).toBe(5);
  });

  it("eachDateInclusive: empty when from > to; fills days otherwise", () => {
    expect(eachDateInclusive("2026-09-22", "2026-09-20")).toEqual([]);
    expect(eachDateInclusive("2026-09-20", "2026-09-22")).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
    expect(toDateKey("2026-09-22T15:30:00.000Z")).toBe("2026-09-22");
  });
});

describe("#91 one definition per metric", () => {
  const totals = (over: Partial<CampaignTotals> = {}): CampaignTotals => ({
    emailsSent: 30,
    leadsEmailed: 10,
    repliedLeads: 2,
    openedLeads: 5,
    bouncedEmails: 1,
    ...over,
  });

  it("campaignRates divides replies, opens and bounces by leads emailed, not emails sent", () => {
    const r = campaignRates(totals());
    expect(r.replyRate).toBe(20);
    expect(r.openRate).toBe(50);
    expect(r.bounceRate).toBe(10);
  });

  it("no leads emailed gives 0 for every rate", () => {
    const r = campaignRates(totals({ leadsEmailed: 0 }));
    expect(r.replyRate).toBe(0);
    expect(r.openRate).toBe(0);
    expect(r.bounceRate).toBe(0);
  });

  it("rates are capped at 100 when more leads replied than were emailed", () => {
    const r = campaignRates(totals({ leadsEmailed: 2, repliedLeads: 5, openedLeads: 9, bouncedEmails: 4 }));
    expect(r.replyRate).toBe(100);
    expect(r.openRate).toBe(100);
    expect(r.bounceRate).toBe(100);
  });

  it("computeAnalyticsRates caps replyRate at 100", () => {
    expect(computeAnalyticsRates(3, 7, 0).replyRate).toBe(100);
  });

  it("the campaign SQL counts leads (distinct, non-dry-run) and repliers (distinct lead or address)", () => {
    const dialect = new PgDialect();
    const emailed = dialect.sqlToQuery(leadsEmailedSql("c1"));
    expect(emailed.sql).toContain("count(distinct ej.lead_id)");
    expect(emailed.sql).toContain("ej.dry_run = false");
    expect(emailed.params).toEqual(["c1"]);
    const replied = dialect.sqlToQuery(repliedLeadsSql("c1"));
    expect(replied.sql).toContain("count(distinct coalesce(r.lead_id, lower(r.from_email)))");
  });
});

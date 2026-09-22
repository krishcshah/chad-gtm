import { describe, expect, it } from "vitest";
import {
  buildAnalyticsSummary,
  computeAnalyticsRates,
  eachDateInclusive,
  toDateKey,
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

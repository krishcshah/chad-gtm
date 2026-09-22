import { describe, expect, it } from "vitest";
import {
  buildAnalyticsSummary,
  computeAnalyticsRates,
  eachDateInclusive,
  toDateKey,
} from "../analytics";

describe("F13a analytics rates + empty range", () => {
  it("empty / zero contacted → rates 0 and open/click always null", () => {
    const empty = buildAnalyticsSummary({
      leadsContacted: 0,
      replyCount: 0,
      bounceCount: 0,
    });
    expect(empty).toEqual({
      leadsContacted: 0,
      replyCount: 0,
      bounceCount: 0,
      replyRate: 0,
      bounceRate: 0,
      openRate: null,
      clickRate: null,
    });

    const withNoise = computeAnalyticsRates(0, 5, 2);
    expect(withNoise.replyRate).toBe(0);
    expect(withNoise.bounceRate).toBe(0);
    expect(withNoise.openRate).toBeNull();
    expect(withNoise.clickRate).toBeNull();
  });

  it("rate math: replyRate and bounceRate are percent 0–100", () => {
    const s = buildAnalyticsSummary({
      leadsContacted: 10,
      replyCount: 2,
      bounceCount: 1,
    });
    expect(s.replyRate).toBe(20);
    expect(s.bounceRate).toBe(10);
    expect(s.openRate).toBeNull();
    expect(s.clickRate).toBeNull();
  });

  it("openRate and clickRate are always null (no fake tracking)", () => {
    for (const [c, r, b] of [
      [0, 0, 0],
      [1, 1, 0],
      [100, 50, 25],
    ] as const) {
      const rates = computeAnalyticsRates(c, r, b);
      expect(rates.openRate).toBeNull();
      expect(rates.clickRate).toBeNull();
    }
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

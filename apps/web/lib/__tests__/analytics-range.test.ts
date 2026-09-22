import { describe, expect, it } from "vitest";
import {
  UNTRACKED_METRIC,
  addUtcDays,
  analyticsProblem,
  chartScale,
  defaultAnalyticsRange,
  formatAnalyticsRate,
  isAnalyticsEmpty,
  parseAnalyticsRange,
  pointY,
  rangeEndingOn,
  xLabelIndexes,
} from "../analytics-range";
import type { AnalyticsPointView, AnalyticsSummaryView } from "../analytics-range";

const emptySummary = (): AnalyticsSummaryView => ({
  leadsContacted: 0,
  replyCount: 0,
  bounceCount: 0,
  replyRate: 0,
  bounceRate: 0,
  openRate: null,
  clickRate: null,
});

describe("analytics range", () => {
  const now = new Date("2026-09-22T18:30:00.000Z");

  it("defaults to 30 inclusive UTC days ending today", () => {
    expect(defaultAnalyticsRange(now)).toEqual({ from: "2026-08-24", to: "2026-09-22" });
    expect(rangeEndingOn("2026-09-22", 7)).toEqual({ from: "2026-09-16", to: "2026-09-22" });
    expect(addUtcDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rejects a reversed range and ignores impossible dates", () => {
    expect(parseAnalyticsRange("2026-09-22", "2026-09-01", now)).toEqual({
      ok: false,
      error: "Start date must be on or before the end date.",
      from: "2026-09-22",
      to: "2026-09-01",
    });
    expect(parseAnalyticsRange("2026-02-31", "nope", now)).toEqual({
      ok: true,
      from: "2026-08-24",
      to: "2026-09-22",
    });
    expect(parseAnalyticsRange("2026-09-01", undefined, now)).toEqual({
      ok: true,
      from: "2026-09-01",
      to: "2026-09-22",
    });
  });
});

describe("analytics display", () => {
  it("renders open and click as an em dash and never a number", () => {
    expect(formatAnalyticsRate(null)).toBe(UNTRACKED_METRIC);
    expect(formatAnalyticsRate(null)).toBe("\u2014");
    expect(formatAnalyticsRate(null)).not.toMatch(/\d/);
    expect(formatAnalyticsRate(20)).toBe("20%");
    expect(formatAnalyticsRate(12.54)).toBe("12.5%");
  });

  it("treats an all-zero range as empty and any real event as data", () => {
    const points: AnalyticsPointView[] = [
      { date: "2026-09-22", sent: 0, contacted: 0, replies: 0, bounces: 0 },
    ];
    expect(isAnalyticsEmpty(emptySummary(), points)).toBe(true);
    expect(isAnalyticsEmpty(emptySummary(), [])).toBe(true);
    expect(
      isAnalyticsEmpty(emptySummary(), [
        { date: "2026-09-22", sent: 1, contacted: 0, replies: 0, bounces: 0 },
      ]),
    ).toBe(false);
    expect(
      isAnalyticsEmpty({ ...emptySummary(), replyCount: 1, replyRate: 0 }, points),
    ).toBe(false);
  });

  it("maps permission failures separately from other errors", () => {
    expect(
      analyticsProblem(
        { ok: false, error: "Access denied" },
        { ok: true, data: { points: [] } },
      ),
    ).toEqual({ kind: "permission", message: "Access denied" });
    expect(
      analyticsProblem({ ok: false, error: "Campaign not found" }, { ok: true, data: { points: [] } }),
    ).toEqual({ kind: "error", message: "Campaign not found" });
    expect(
      analyticsProblem({ ok: true, data: { leadsContacted: 0 } }, { ok: true, data: { points: [] } }),
    ).toBeNull();
  });
});

describe("analytics chart scale", () => {
  it("keeps labels sparse and places the peak near the top", () => {
    expect(xLabelIndexes(1)).toEqual([0]);
    expect(xLabelIndexes(7)).toHaveLength(4);
    expect(xLabelIndexes(30)[0]).toBe(0);
    expect(xLabelIndexes(30).at(-1)).toBe(29);
    const scale = chartScale(3);
    expect(scale.max).toBeGreaterThanOrEqual(3);
    expect(pointY(scale.max, scale.max)).toBeLessThan(pointY(0, scale.max));
  });
});

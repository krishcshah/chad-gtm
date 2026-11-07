import { describe, expect, it } from "vitest";
import { utcIsoToZonedWallTime, zonedWallTimeToUtcIso } from "@smartreach/shared";
import { datetimeLocalToIso, isoToDatetimeLocal } from "../../app/(app)/campaigns/new/wizard-utils";

describe("wizard start time is read in the sending timezone", () => {
  it("converts New York wall time just after the March DST change", () => {
    // DST started on 2026-03-08, so 09:00 on the 10th is UTC-4.
    expect(datetimeLocalToIso("2026-03-10T09:00", "America/New_York")).toBe("2026-03-10T13:00:00.000Z");
    // Before the change it was UTC-5.
    expect(datetimeLocalToIso("2026-03-06T09:00", "America/New_York")).toBe("2026-03-06T14:00:00.000Z");
  });

  it("uses Berlin's winter and summer offsets", () => {
    expect(zonedWallTimeToUtcIso("2026-01-15T09:00", "Europe/Berlin")).toBe("2026-01-15T08:00:00.000Z");
    expect(zonedWallTimeToUtcIso("2026-07-15T09:00", "Europe/Berlin")).toBe("2026-07-15T07:00:00.000Z");
  });

  it("round-trips through the stored UTC value", () => {
    for (const [local, tz] of [
      ["2026-03-10T09:00", "America/New_York"],
      ["2026-11-06T23:30", "Australia/Sydney"],
      ["2026-07-01T00:15", "Asia/Kolkata"],
      ["2026-12-31T18:45", "UTC"],
    ] as const) {
      const iso = datetimeLocalToIso(local, tz)!;
      expect(utcIsoToZonedWallTime(iso, tz)).toBe(local);
      expect(isoToDatetimeLocal(iso, tz)).toBe(local);
    }
  });

  it("defaults to UTC when no timezone is given", () => {
    expect(isoToDatetimeLocal("2026-03-10T13:00:00.000Z")).toBe("2026-03-10T13:00");
  });

  it("returns null or empty for unreadable input", () => {
    expect(datetimeLocalToIso("", "UTC")).toBeNull();
    expect(datetimeLocalToIso("tomorrow at nine", "UTC")).toBeNull();
    expect(zonedWallTimeToUtcIso("2026-02-30T09:00", "UTC")).toBeNull();
    expect(zonedWallTimeToUtcIso("2026-03-10T09:00", "Not/AZone")).toBeNull();
    expect(isoToDatetimeLocal(null, "UTC")).toBe("");
    expect(isoToDatetimeLocal("garbage", "UTC")).toBe("");
  });
});

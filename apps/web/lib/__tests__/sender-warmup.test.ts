import { describe, expect, it } from "vitest";
import {
  WARMUP_STATUS_DESCRIPTION,
  hasWarmupMarker,
  stripWarmupMarker,
} from "../sender-warmup";

const LEGACY =
  'Best,\nJane\n<!--SR_WARMUP:{"enabled":true,"dailyLimit":20,"replyRate":40,"sentCount":3,"receivedCount":1}-->';

describe("sender warm-up markers", () => {
  it("detects and strips the legacy warm-up JSON so it never reaches recipients", () => {
    expect(hasWarmupMarker(LEGACY)).toBe(true);
    expect(stripWarmupMarker(LEGACY)).toBe("Best,\nJane");
    expect(stripWarmupMarker(LEGACY)).not.toContain("SR_WARMUP");
  });

  it("strips several markers and markers spanning lines", () => {
    const sig = 'Hi<!--SR_WARMUP:{"a":1}-->\nthere\n<!-- SR_WARMUP:{\n"b":2}-->';
    expect(stripWarmupMarker(sig)).toBe("Hi\nthere");
    expect(hasWarmupMarker(stripWarmupMarker(sig))).toBe(false);
  });

  it("leaves normal signatures and other HTML comments alone", () => {
    expect(stripWarmupMarker("  Jane Doe\nAcme  ")).toBe("Jane Doe\nAcme");
    expect(stripWarmupMarker("<!-- note -->Jane")).toBe("<!-- note -->Jane");
    expect(hasWarmupMarker("Jane")).toBe(false);
    expect(stripWarmupMarker(null)).toBe("");
    expect(stripWarmupMarker(undefined)).toBe("");
  });

  it("is repeatable (global regex state does not leak between calls)", () => {
    expect(hasWarmupMarker(LEGACY)).toBe(true);
    expect(hasWarmupMarker(LEGACY)).toBe(true);
  });

  it("states plainly that AutoGTM sends no warm-up email", () => {
    expect(WARMUP_STATUS_DESCRIPTION).toMatch(/doesn't warm up/);
  });
});

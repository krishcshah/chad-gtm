import { describe, expect, it } from "vitest";
import { normalizeHhMm } from "../hhmm";

describe("normalizeHhMm", () => {
  it("pads a single-digit hour and drops seconds", () => {
    expect(normalizeHhMm("9:05")).toBe("09:05");
    expect(normalizeHhMm("09:00:00")).toBe("09:00");
    expect(normalizeHhMm(" 0:00:01 ")).toBe("00:00");
  });

  it("keeps values the schema should reject", () => {
    expect(normalizeHhMm("24:00")).toBe("24:00");
    expect(normalizeHhMm("9:5")).toBe("9:5");
    expect(normalizeHhMm("")).toBe("");
  });
});

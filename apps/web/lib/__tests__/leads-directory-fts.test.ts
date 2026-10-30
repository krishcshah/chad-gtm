import { describe, expect, it } from "vitest";
import { toFtsMatchExpression } from "../leads-directory";

describe("toFtsMatchExpression", () => {
  it("builds safe prefix tokens", () => {
    expect(toFtsMatchExpression("VP of Sales")).toBe('"vp"* AND "sales"*');
  });

  it("drops single characters and escapes quotes", () => {
    expect(toFtsMatchExpression('a "quoted" term')).toBe('"quoted"* AND "term"*');
  });

  it("returns an empty phrase for punctuation-only input", () => {
    expect(toFtsMatchExpression("!!!")).toBe('""');
  });
});

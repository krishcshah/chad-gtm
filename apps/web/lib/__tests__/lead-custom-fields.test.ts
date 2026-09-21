import { describe, expect, it } from "vitest";
import { mergeLeadCustomFields, stripUndefined } from "../lead-custom-fields";

describe("mergeLeadCustomFields", () => {
  it("merges / upserts provided keys and keeps omitted keys", () => {
    const next = mergeLeadCustomFields(
      { a: "1", b: "2", c: "3" },
      { b: "updated", d: "new" },
    );
    expect(next).toEqual({ a: "1", b: "updated", c: "3", d: "new" });
  });

  it("deletes a key when patch value is null", () => {
    const next = mergeLeadCustomFields({ a: "1", b: "2" }, { b: null });
    expect(next).toEqual({ a: "1" });
    expect(Object.keys(next)).not.toContain("b");
  });
});

describe("stripUndefined", () => {
  it("removes undefined keys only", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null });
  });
});

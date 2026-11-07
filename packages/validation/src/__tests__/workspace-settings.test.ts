import { describe, expect, it } from "vitest";
import { POSTAL_ADDRESS_PROBLEM } from "@smartreach/shared";
import { workspaceSettingsSchema } from "../index";

describe("workspaceSettingsSchema identity (#18)", () => {
  it("accepts a blank or full postal address", () => {
    expect(workspaceSettingsSchema.safeParse({ postalAddress: "" }).success).toBe(true);
    const full = workspaceSettingsSchema.safeParse({
      companyName: "Acme Inc.",
      postalAddress: "1 Main St, Springfield, IL 62701, USA",
    });
    expect(full.success).toBe(true);
  });

  it("rejects placeholders and partial addresses with the shared message", () => {
    for (const postalAddress of ["TBD", "1 Main St", "Main Street, Berlin"]) {
      const r = workspaceSettingsSchema.safeParse({ postalAddress });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0]?.path).toEqual(["postalAddress"]);
        expect(r.error.issues[0]?.message).toBe(POSTAL_ADDRESS_PROBLEM);
      }
    }
  });

  it("accepts a blank company name and rejects a one-letter one", () => {
    expect(workspaceSettingsSchema.safeParse({ companyName: "" }).success).toBe(true);
    const r = workspaceSettingsSchema.safeParse({ companyName: "A" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["companyName"]);
  });
});

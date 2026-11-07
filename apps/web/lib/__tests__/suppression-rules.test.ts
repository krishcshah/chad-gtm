import { describe, expect, it } from "vitest";
import { GLOBAL_SUPPRESSION_SOURCES } from "@smartreach/database";
import {
  isProtectedOptOut,
  PROTECTED_OPT_OUT_ERROR,
  PROTECTED_OPT_OUT_SOURCES,
  suppressionRemovalError,
  unblockDescription,
} from "../suppression-rules";

describe("suppressionRemovalError", () => {
  it("refuses to remove global opt-outs for non-admins", () => {
    for (const s of ["unsubscribe", "bounce", "complaint", "erasure"]) {
      expect(suppressionRemovalError(s, false)).toBe(PROTECTED_OPT_OUT_ERROR);
    }
  });

  it("allows removing this customer's own entries", () => {
    for (const s of ["manual", "import", "not_interested"]) {
      expect(suppressionRemovalError(s, false)).toBeNull();
    }
  });

  it("lets admins remove anything", () => {
    for (const s of ["unsubscribe", "bounce", "complaint", "erasure", "manual"]) {
      expect(suppressionRemovalError(s, true)).toBeNull();
    }
  });
});

describe("isProtectedOptOut", () => {
  it("covers erasure but not 'not interested'", () => {
    expect(isProtectedOptOut("erasure")).toBe(true);
    expect(isProtectedOptOut("not_interested")).toBe(false);
    expect(isProtectedOptOut(null)).toBe(false);
  });

  it("matches the database's global sources exactly", () => {
    expect([...PROTECTED_OPT_OUT_SOURCES].sort()).toEqual([...GLOBAL_SUPPRESSION_SOURCES].sort());
  });
});

describe("unblockDescription", () => {
  it("doesn't promise a 'Not interested' lead will be emailed again", () => {
    const text = unblockDescription("ada@acme.com", "not_interested");
    expect(text).toContain("not interested");
    expect(text).toContain("won't pick them up again");
    expect(text).toContain("back to New");
    expect(text).not.toMatch(/can email/);
  });

  it("says another entry can still block a hand-added address", () => {
    for (const s of ["manual", "import", null]) {
      const text = unblockDescription("ada@acme.com", s);
      expect(text).toContain("Campaigns can email ada@acme.com again, unless another Blocklist entry");
    }
  });

  it("warns an admin that a global opt-out protects every customer", () => {
    expect(unblockDescription("ada@acme.com", "unsubscribe")).toContain("protects every AutoGTM customer");
  });

  it("falls back to 'this address' without a value", () => {
    expect(unblockDescription(null, "manual")).toContain("email this address again");
  });
});

import { describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  matchesSuppression,
  ensurePostalFooter,
  ensureUnsubscribeFooter,
  listUnsubscribeHeaders,
  normalizeEmail,
} from "../compliance";

describe("unsubscribe tokens", () => {
  it("round-trips a valid token", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-unsub-tokens-xxxxxx";
    const token = createUnsubscribeToken("user-1", "Ada@Example.COM");
    const v = verifyUnsubscribeToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.userId).toBe("user-1");
      expect(v.email).toBe("ada@example.com");
    }
  });
  it("rejects tampered tokens", () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-for-unsub-tokens-xxxxxx";
    const token = createUnsubscribeToken("user-1", "a@b.com");
    expect(verifyUnsubscribeToken(token + "x").ok).toBe(false);
  });
});

describe("suppression matching", () => {
  it("matches email and domain", () => {
    expect(matchesSuppression("a@B.com", ["a@b.com"])).toBe(true);
    expect(matchesSuppression("x@Blocked.io", ["@blocked.io"])).toBe(true);
    expect(matchesSuppression("ok@fine.com", ["@blocked.io", "nope@x.com"])).toBe(false);
  });
});

describe("footers + headers", () => {
  it("appends postal + unsub once", () => {
    const once = ensurePostalFooter("Hi", { postalAddress: "1 Main St", companyName: "Acme", asHtml: false });
    const twice = ensurePostalFooter(once, { postalAddress: "1 Main St", companyName: "Acme", asHtml: false });
    expect(twice).toBe(once);
    expect(once).toContain("1 Main St");
    const u = ensureUnsubscribeFooter(once, { unsubUrl: "http://localhost:3000/unsubscribe?token=t", asHtml: false });
    expect(u).toContain("Unsubscribe:");
    expect(listUnsubscribeHeaders("http://x/u")["List-Unsubscribe"]).toContain("<http://x/u>");
  });
  it("normalizes email", () => {
    expect(normalizeEmail("  A@B.Com ")).toBe("a@b.com");
  });
});

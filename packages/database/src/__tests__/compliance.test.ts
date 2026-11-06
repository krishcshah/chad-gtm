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
  it("keeps links signed with the old secret valid after rotation via UNSUBSCRIBE_SECRET_PREVIOUS", () => {
    const prevEnv = { a: process.env.BETTER_AUTH_SECRET, p: process.env.UNSUBSCRIBE_SECRET_PREVIOUS };
    try {
      process.env.BETTER_AUTH_SECRET = "old-secret-before-rotation-xxxxxxxx";
      delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
      const oldToken = createUnsubscribeToken("user-1", "a@b.com");

      // Rotate: new secret, old one not configured -> old links break.
      process.env.BETTER_AUTH_SECRET = "new-secret-after-rotation-yyyyyyyy";
      expect(verifyUnsubscribeToken(oldToken).ok).toBe(false);

      // With the old secret as UNSUBSCRIBE_SECRET_PREVIOUS -> old links work.
      process.env.UNSUBSCRIBE_SECRET_PREVIOUS = "old-secret-before-rotation-xxxxxxxx";
      const v = verifyUnsubscribeToken(oldToken);
      expect(v.ok).toBe(true);
      if (v.ok) expect(v.email).toBe("a@b.com");

      // New tokens are signed with the current secret only.
      const newToken = createUnsubscribeToken("user-1", "a@b.com");
      expect(verifyUnsubscribeToken(newToken).ok).toBe(true);
      delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
      expect(verifyUnsubscribeToken(newToken).ok).toBe(true);
      process.env.BETTER_AUTH_SECRET = "old-secret-before-rotation-xxxxxxxx";
      expect(verifyUnsubscribeToken(newToken).ok).toBe(false);

      // A token signed with some other secret is still rejected.
      process.env.BETTER_AUTH_SECRET = "unrelated-secret-zzzzzzzzzzzzzzzzz";
      const foreign = createUnsubscribeToken("user-1", "a@b.com");
      process.env.BETTER_AUTH_SECRET = "new-secret-after-rotation-yyyyyyyy";
      process.env.UNSUBSCRIBE_SECRET_PREVIOUS = "old-secret-before-rotation-xxxxxxxx";
      expect(verifyUnsubscribeToken(foreign).ok).toBe(false);
    } finally {
      if (prevEnv.a === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = prevEnv.a;
      if (prevEnv.p === undefined) delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
      else process.env.UNSUBSCRIBE_SECRET_PREVIOUS = prevEnv.p;
    }
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

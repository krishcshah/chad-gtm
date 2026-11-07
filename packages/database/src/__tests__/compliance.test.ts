import { describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
  matchesSuppression,
  ensurePostalFooter,
  ensureUnsubscribeFooter,
  listUnsubscribeHeaders,
  normalizeEmail,
  applicableSuppressionValues,
  GLOBAL_SUPPRESSION_SOURCES,
  SUPPRESSION_SOURCES,
  isGlobalSuppressionSource,
  suppressionVerdict,
} from "../compliance";
import { suppressions } from "../schema";

describe("suppressionVerdict (one recipient check for every send path)", () => {
  it("another user's unsubscribe is a global block", () => {
    expect(
      suppressionVerdict([{ value: "dana@acme.com", userId: "user-b", source: "unsubscribe" }], "user-a"),
    ).toEqual({ level: "global", source: "unsubscribe" });
  });

  it("the user's own manual domain row is an own block", () => {
    expect(suppressionVerdict([{ value: "@acme.com", userId: "user-a", source: "manual" }], "user-a")).toEqual({
      level: "own",
      source: "manual",
    });
  });

  it("another user's manual row does not apply", () => {
    expect(suppressionVerdict([{ value: "dana@acme.com", userId: "user-b", source: "manual" }], "user-a")).toBeNull();
  });

  it("a global row wins over the user's own row", () => {
    expect(
      suppressionVerdict(
        [
          { value: "dana@acme.com", userId: "user-a", source: "not_interested" },
          { value: "dana@acme.com", userId: null, source: "bounce" },
        ],
        "user-a",
      ),
    ).toEqual({ level: "global", source: "bounce" });
  });
});

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

describe("suppressions that outlive their owner", () => {
  it("a global opt-out with no owner still blocks every user", () => {
    const rows = [
      { value: "gone@acme-example.com", userId: null, source: "unsubscribe" },
      { value: "bounced@acme-example.com", userId: null, source: "bounce" },
      { value: "erased@acme-example.com", userId: null, source: "erasure" },
    ];
    expect(applicableSuppressionValues(rows, "user-a")).toEqual([
      "gone@acme-example.com",
      "bounced@acme-example.com",
      "erased@acme-example.com",
    ]);
  });

  it("a private blocklist row with no owner blocks nobody", () => {
    const rows = [
      { value: "manual@acme-example.com", userId: null, source: "manual" },
      { value: "import@acme-example.com", userId: null, source: "import" },
    ];
    expect(applicableSuppressionValues(rows, "user-a")).toEqual([]);
  });

  it("keeps unsubscribes, bounces and complaints global", () => {
    for (const s of ["unsubscribe", "bounce", "complaint", "erasure"]) {
      expect(GLOBAL_SUPPRESSION_SOURCES as readonly string[]).toContain(s);
    }
    expect(GLOBAL_SUPPRESSION_SOURCES as readonly string[]).not.toContain("manual");
    expect(GLOBAL_SUPPRESSION_SOURCES as readonly string[]).not.toContain("not_interested");
  });
});

describe("erasure requests", () => {
  it("are a global source", () => {
    expect(isGlobalSuppressionSource("erasure")).toBe(true);
    expect(isGlobalSuppressionSource("not_interested")).toBe(false);
    expect(isGlobalSuppressionSource(null)).toBe(false);
  });

  it("apply to every user, owned or not", () => {
    const rows = [
      { value: "erased@acme-example.com", userId: null, source: "erasure" },
      { value: "erased2@acme-example.com", userId: "user-b", source: "erasure" },
      { value: "mine@acme-example.com", userId: "user-b", source: "manual" },
    ];
    for (const u of ["user-a", "user-c"]) {
      expect(applicableSuppressionValues(rows, u)).toEqual([
        "erased@acme-example.com",
        "erased2@acme-example.com",
      ]);
    }
  });

  it("SUPPRESSION_SOURCES matches the schema enum and contains every global source", () => {
    expect([...SUPPRESSION_SOURCES].sort()).toEqual([...suppressions.source.enumValues].sort());
    for (const s of GLOBAL_SUPPRESSION_SOURCES) expect(SUPPRESSION_SOURCES as readonly string[]).toContain(s);
  });
});

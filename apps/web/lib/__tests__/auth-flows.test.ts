import { describe, expect, it } from "vitest";
import { authLinkErrorMessage, firstParam, verifiedRedirectTarget } from "../auth-redirects";
import { validateNewPassword } from "../password-rules";
import {
  approvalLaunchUrl,
  buildApprovalEmail,
  buildExistingAccountEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  escapeHtml,
  firstNameOf,
} from "../system-emails";
import { isValidUserId, latestWebsiteByUser, toApprovalRows } from "../account-approvals";

describe("auth redirects", () => {
  it("only redirects to known in-app paths", () => {
    expect(verifiedRedirectTarget("dashboard")).toBe("/dashboard");
    expect(verifiedRedirectTarget(undefined)).toBe("/chad-gtm?new_signup=1");
    expect(verifiedRedirectTarget("https://evil.example")).toBe("/chad-gtm?new_signup=1");
    expect(verifiedRedirectTarget(["dashboard", "x"])).toBe("/dashboard");
  });

  it("maps better-auth link errors to messages", () => {
    expect(authLinkErrorMessage(undefined)).toBeNull();
    expect(authLinkErrorMessage("")).toBeNull();
    expect(authLinkErrorMessage("INVALID_TOKEN")).toMatch(/invalid/);
    expect(authLinkErrorMessage("token_expired")).toMatch(/expired/);
    expect(authLinkErrorMessage("SOMETHING")).toMatch(/didn't work/);
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam(undefined)).toBe("");
  });
});

describe("validateNewPassword", () => {
  it("enforces length and confirmation", () => {
    expect(validateNewPassword("short", "short")).toMatch(/at least 8/);
    expect(validateNewPassword("x".repeat(129), "x".repeat(129))).toMatch(/at most 128/);
    expect(validateNewPassword("longenough", "different1")).toMatch(/match/);
    expect(validateNewPassword("longenough", "longenough")).toBeNull();
  });
});

describe("system emails", () => {
  it("escapes user-controlled names in HTML", () => {
    const mail = buildVerificationEmail({ name: "<script>x</script> Doe", url: "https://a.test/v?t=1&c=2" });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(mail.html).toContain("https://a.test/v?t=1&amp;c=2");
    expect(mail.text).toContain("https://a.test/v?t=1&c=2");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });

  it("builds reset and approval emails", () => {
    expect(firstNameOf("  Dana  Client ")).toBe("Dana");
    expect(firstNameOf("")).toBe("there");
    const reset = buildPasswordResetEmail({ name: "Dana", url: "https://a.test/r" });
    expect(reset.subject).toMatch(/Reset/);
    expect(reset.text).toContain("Hi Dana,");
    expect(reset.text).toContain("https://a.test/r");
    const approved = buildApprovalEmail({ name: "Dana", appUrl: "https://autogtm.tech/" });
    expect(approved.text).toContain("https://autogtm.tech/chad-gtm");
    const noUrl = buildApprovalEmail({ name: null, appUrl: "" });
    expect(noUrl.text).toContain("Hi there,");
    expect(noUrl.text).not.toContain("undefined");
  });
});

describe("approval email copy", () => {
  it("does not claim campaigns are sending and links to the run to launch it", () => {
    const mail = buildApprovalEmail({ name: "Dana", appUrl: "https://autogtm.tech", runId: "run_123" });
    expect(mail.text).toContain("Your AutoGTM account is approved.");
    expect(mail.text).toMatch(/Open AutoGTM to review your plan and launch your campaign/);
    expect(mail.text).not.toMatch(/can now send/i);
    expect(mail.text).toContain("https://autogtm.tech/chad-gtm/run_123");
    expect(mail.html).toContain('href="https://autogtm.tech/chad-gtm/run_123"');
    expect(mail.text).not.toContain("/dashboard");
  });

  it("falls back to the launcher and rejects odd run ids", () => {
    expect(approvalLaunchUrl("https://a.test/", null)).toBe("https://a.test/chad-gtm");
    expect(approvalLaunchUrl("https://a.test", "../x?y")).toBe("https://a.test/chad-gtm");
    expect(approvalLaunchUrl("", "run_1")).toBe("");
  });
});

describe("existing-account sign-up email", () => {
  it("points to sign in and password reset", () => {
    const mail = buildExistingAccountEmail({ name: "Dana", appUrl: "https://autogtm.tech/" });
    expect(mail.subject).toMatch(/already have/);
    expect(mail.text).toContain("https://autogtm.tech/login");
    expect(mail.text).toContain("https://autogtm.tech/forgot-password");
    expect(buildExistingAccountEmail({ appUrl: "" }).text).toMatch(/Forgot password/);
  });
});

describe("account approvals", () => {
  it("picks the latest non-empty run URL per user", () => {
    const map = latestWebsiteByUser([
      { userId: "u1", url: "old.com", createdAt: "2026-11-01T00:00:00.000Z" },
      { userId: "u1", url: "new.com", createdAt: "2026-11-05T00:00:00.000Z" },
      { userId: "u1", url: "", createdAt: "2026-11-06T00:00:00.000Z" },
      { userId: "u2", url: "two.com", createdAt: null },
    ]);
    expect(map.get("u1")).toBe("new.com");
    expect(map.get("u2")).toBe("two.com");
    expect(map.has("u3")).toBe(false);
  });

  it("serialises rows with ISO dates and websites", () => {
    const rows = toApprovalRows(
      [
        {
          id: "u1",
          name: null,
          email: "a@b.c",
          emailVerified: null,
          createdAt: new Date("2026-11-06T10:00:00Z"),
          approvedAt: null,
        },
      ],
      new Map([["u1", "acme.com"]]),
    );
    expect(rows).toEqual([
      {
        userId: "u1",
        name: "",
        email: "a@b.c",
        emailVerified: false,
        createdAt: "2026-11-06T10:00:00.000Z",
        approvedAt: null,
        revokedAt: null,
        website: "acme.com",
      },
    ]);
  });

  it("validates user ids", () => {
    expect(isValidUserId("Ab3_xY-12345")).toBe(true);
    expect(isValidUserId("6f1c2b3e-1111-4222-8333-944445555666")).toBe(true);
    expect(isValidUserId("x")).toBe(false);
    expect(isValidUserId("a'; drop table users;--")).toBe(false);
    expect(isValidUserId(42)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { approvalBannerText, approvalCopy, awaitingApprovalText } from "../approval-copy";
import { APPROVAL_REQUIRED_ERROR } from "../approval";

describe("pending-approval copy", () => {
  it("promises an approval email only when the system mailer is configured", () => {
    expect(approvalBannerText(true)).toMatch(/email you/);
    expect(approvalBannerText(false)).not.toMatch(/email/i);
  });

  it("keeps the launch card from repeating the banner's approval explanation", () => {
    const text = awaitingApprovalText();
    expect(text).toContain("launches on its own");
    expect(text).not.toMatch(/email/i);
    expect(text).not.toMatch(/Check back/i);
  });

  it("strips the email promise from server copy when no email will be sent", () => {
    expect(approvalCopy(APPROVAL_REQUIRED_ERROR, true)).toBe(APPROVAL_REQUIRED_ERROR);
    const stripped = approvalCopy(APPROVAL_REQUIRED_ERROR, false);
    expect(stripped).not.toMatch(/email/i);
    expect(stripped).toMatch(/waiting for approval/);
    expect(approvalCopy("Nothing sends until we approve your account, and we'll email you when we do.", false)).toBe(
      "Nothing sends until we approve your account.",
    );
  });
});

describe("revoked-sending copy", () => {
  it("points to support and never reads like a pending approval", async () => {
    const { REVOKED_BANNER_TITLE, revokedBannerText } = await import("../approval-copy");
    expect(REVOKED_BANNER_TITLE).toBe("Sending is paused by AutoGTM.");
    const text = revokedBannerText();
    expect(text).toMatch(/support/i);
    expect(text).not.toMatch(/pending approval/i);
    expect(text).not.toMatch(/Set everything up/i);
  });

  it("renders the revoked banner with a Contact support link", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ApprovalBanner } = await import("../../app/(app)/approval-banner");
    const revoked = renderToStaticMarkup(React.createElement(ApprovalBanner, { access: "revoked", emailOnApprove: true }));
    expect(revoked).toContain("Sending is paused by AutoGTM.");
    expect(revoked).toContain('href="/support"');
    expect(revoked).not.toMatch(/pending approval/i);
    const pending = renderToStaticMarkup(React.createElement(ApprovalBanner, { access: "pending", emailOnApprove: false }));
    expect(pending).toContain("Your account is pending approval.");
    expect(pending).not.toContain('href="/support"');
  });
});

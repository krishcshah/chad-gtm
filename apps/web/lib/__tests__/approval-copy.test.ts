import { describe, expect, it } from "vitest";
import { APPROVAL_CHECK_BACK, approvalBannerText, approvalCopy, awaitingApprovalText } from "../approval-copy";
import { APPROVAL_REQUIRED_ERROR } from "../approval";

describe("pending-approval copy", () => {
  it("promises an approval email only when the system mailer is configured", () => {
    expect(approvalBannerText(true)).toMatch(/email you/);
    expect(approvalBannerText(false)).not.toMatch(/email/i);
    expect(awaitingApprovalText(true)).toMatch(/You'll get an email/);
    expect(awaitingApprovalText(false)).not.toMatch(/email/i);
    expect(awaitingApprovalText(false)).toContain(APPROVAL_CHECK_BACK);
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

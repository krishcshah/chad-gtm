import { describe, expect, it } from "vitest";
import { buildApprovalEmail, heldWaitingText } from "../system-emails";

/* #84: on approval the client is told how many lead conversations arrived
 * while the account was on hold. Approval itself sends nothing to leads. */

describe("approval email: conversations held while on hold", () => {
  const base = { name: "Dana Lee", appUrl: "https://app.autogtm.test", runId: "run_1" };

  it("mentions the waiting conversations and Needs you", () => {
    const email = buildApprovalEmail({ ...base, waitingCount: 3 });
    expect(email.text).toContain("3 lead conversations arrived while your account was on hold");
    expect(email.text).toContain("Needs you");
    expect(email.html).toContain("3 lead conversations arrived while your account was on hold");
    expect(email.html).toContain("Needs you");
  });

  it("never says nothing was sent when conversations are waiting, and links to Needs you", () => {
    const email = buildApprovalEmail({ ...base, waitingCount: 2 });
    for (const part of [email.text, email.html]) {
      expect(part).not.toContain("Nothing has been sent");
      expect(part).not.toContain("launch your campaign");
      expect(part).toContain("Your running campaigns can send again.");
      expect(part).toContain("https://app.autogtm.test/requests");
    }
    expect(email.text).toContain("Open Needs you: https://app.autogtm.test/requests");
  });

  it("a re-approved account with nothing waiting is told its campaigns can send again", () => {
    const email = buildApprovalEmail({ ...base, reapproved: true });
    expect(email.text).toBe(
      "Hi Dana,\n\nYour AutoGTM account is approved.\n\nYour running campaigns can send again.\n\nOpen AutoGTM: https://app.autogtm.test/dashboard\n\n— AutoGTM",
    );
    expect(email.html).not.toContain("Nothing has been sent");
  });

  it("without an app URL, the re-approval copy still reads plainly", () => {
    const email = buildApprovalEmail({ name: "Dana", waitingCount: 1 });
    expect(email.text).toContain("Sign in to AutoGTM to see your campaigns.");
    expect(email.text).not.toContain("Nothing has been sent");
  });

  it("uses the singular for one conversation", () => {
    expect(heldWaitingText(1)).toBe(
      "1 lead conversation arrived while your account was on hold. They're waiting for you in Needs you.",
    );
  });

  it("leaves the copy unchanged with 0 or no count", () => {
    const plain = buildApprovalEmail(base);
    expect(buildApprovalEmail({ ...base, waitingCount: 0 })).toEqual(plain);
    expect(buildApprovalEmail({ ...base, waitingCount: undefined })).toEqual(plain);
    expect(plain.text).not.toContain("on hold");
    expect(plain.text).toBe(
      "Hi Dana,\n\nYour AutoGTM account is approved.\n\nNothing has been sent yet. Open AutoGTM to review your plan and launch your campaign.\n\nLaunch your campaign: https://app.autogtm.test/chad-gtm/run_1\n\n— AutoGTM",
    );
  });
});

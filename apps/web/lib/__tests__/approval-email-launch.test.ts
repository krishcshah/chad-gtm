import { describe, expect, it } from "vitest";
import { buildApprovalEmail, buildApprovalLaunchGaveUpEmail, buildSignupAlertEmail } from "../system-emails";
import {
  LINKED_NOT_STARTED_MESSAGE,
  approvalBannerText,
  approvalLaunchView,
  approvalNoteFor,
  approvalOutcomeText,
  readApprovalLaunch,
  type ApprovalLaunchRecord,
} from "../approval-copy";
import { latestApprovalLaunchByUser } from "../account-approvals";

const base = { name: "Dana Lee", appUrl: "https://app.autogtm.test", runId: "run_latest" };

describe("approval email after the launch", () => {
  it("says the campaign is live and links to it", () => {
    const mail = buildApprovalEmail({ ...base, launch: { kind: "live", runId: "run_1" } });
    expect(mail.subject).toBe("Your AutoGTM campaign is live");
    expect(mail.text).toBe(
      "Hi Dana,\n\nYour AutoGTM account is approved.\n\nYour campaign is live. The agent is emailing your prospects and will book interested ones on your calendar. You don't need to do anything.\n\nSee your campaign: https://app.autogtm.test/chad-gtm/run_1\n\n— AutoGTM",
    );
    expect(mail.html).toContain('href="https://app.autogtm.test/chad-gtm/run_1"');
  });

  it("never uses the 'is live' subject while the launch is still starting", () => {
    const mail = buildApprovalEmail({ ...base, launch: { kind: "starting", runId: "run_1" } });
    expect(mail.subject).toBe("Your AutoGTM account is approved");
    expect(mail.text).toContain("Your campaign is starting now.");
  });

  it("names the one thing left when details are missing", () => {
    const booking = buildApprovalEmail({ ...base, launch: { kind: "details", runId: "run_1", missing: ["bookingUrl"] } });
    expect(booking.subject).toBe("Your AutoGTM account is approved");
    expect(booking.text).toContain("One thing left before your campaign starts: add your booking link");
    expect(booking.text).toContain("your campaign starts on its own");
    expect(booking.text).toContain("Add your booking link: https://app.autogtm.test/chad-gtm/run_1");
    const footer = buildApprovalEmail({
      ...base,
      launch: { kind: "details", runId: "run_1", missing: ["companyName", "postalAddress"] },
    });
    expect(footer.text).toContain("add your company name and postal address");
    expect(footer.text).toContain("Add your details:");
  });

  it("a campaign set up but not started says Resume outreach, like the run page", () => {
    const mail = buildApprovalEmail({ ...base, launch: { kind: "paused", runId: "run_1" } });
    expect(mail.text).toContain(LINKED_NOT_STARTED_MESSAGE);
    expect(mail.text).toContain("Press Resume outreach");
    expect(mail.text).not.toMatch(/press Launch/i);
  });

  it("promises an automatic retry only when one is scheduled", () => {
    const retrying = buildApprovalEmail({ ...base, launch: { kind: "failed", runId: "run_1", retrying: true } });
    expect(retrying.text).toContain("We'll retry the launch for you automatically.");
    const final = buildApprovalEmail({ ...base, launch: { kind: "failed", runId: "run_1" } });
    expect(final.text).not.toMatch(/automatically/);
    expect(final.text).toContain("press Retry launch");
    const reason = buildApprovalEmail({ ...base, launch: { kind: "failed", runId: "run_1", reason: "Mailboxes are busy." } });
    expect(reason.text).toContain("Your campaign didn't start yet. Mailboxes are busy.");
  });

  it("'none' with a run of theirs links to it; only without any run says enter your website", () => {
    const withRun = buildApprovalEmail({ ...base, launch: { kind: "none" } });
    expect(withRun.text).toContain("Open AutoGTM to review your plan and launch your campaign.");
    expect(withRun.text).toContain("https://app.autogtm.test/chad-gtm/run_latest");
    expect(withRun.text).not.toContain("Enter your website");
    const noRun = buildApprovalEmail({ ...base, runId: null, launch: { kind: "none" } });
    expect(noRun.text).toContain("Enter your website in AutoGTM");
    expect(noRun.text).toContain("https://app.autogtm.test/chad-gtm\n");
  });

  it("lists the other plans it did not start, with links", () => {
    const mail = buildApprovalEmail({
      ...base,
      launch: { kind: "live", runId: "run_1" },
      notStarted: [{ runId: "run_2", name: "Acme <Labs>" }],
    });
    expect(mail.text).toContain("We didn't start your other plan. Open it to launch it:\n- Acme <Labs>: https://app.autogtm.test/chad-gtm/run_2");
    expect(mail.html).toContain('<a href="https://app.autogtm.test/chad-gtm/run_2">Acme &lt;Labs&gt;</a>');
    expect(buildApprovalEmail({ ...base, launch: { kind: "live", runId: "run_1" } }).text).not.toContain("didn't start");
  });

  it("a re-approved account that also launched a waiting run says both", () => {
    const mail = buildApprovalEmail({ ...base, reapproved: true, launch: { kind: "live", runId: "run_1" } });
    expect(mail.text).toContain("Your running campaigns can send again.");
    expect(mail.text).toContain("Your campaign is live.");
  });

  it("without an app URL still reads plainly", () => {
    const mail = buildApprovalEmail({ name: null, launch: { kind: "live", runId: "run_1" } });
    expect(mail.text).toContain("Sign in to AutoGTM to see your campaign.");
    expect(mail.text).not.toContain("undefined");
  });

  it("tells the client when we stopped retrying", () => {
    const mail = buildApprovalLaunchGaveUpEmail({ name: "Dana", appUrl: "https://app.autogtm.test", runId: "run_1" });
    expect(mail.subject).toBe("Your AutoGTM campaign didn't start");
    expect(mail.text).toContain("press Retry launch");
    expect(mail.text).toContain("https://app.autogtm.test/chad-gtm/run_1");
  });

  it("the admin signup alert only promises the one launch", () => {
    expect(buildSignupAlertEmail({ email: "x@y.test" }).text).toContain("their latest ready plan launches on its own");
  });
});

describe("approval email: other plans and missing details", () => {
  const appUrl = "https://autogtm.tech";

  it("never lists the plan the button opens as 'your other plan'", () => {
    // The only ready run is older than 14 days: it is both the button and in notStarted.
    const mail = buildApprovalEmail({ appUrl, runId: "X", launch: { kind: "none" }, notStarted: [{ runId: "X", name: "Acme" }] });
    expect(mail.text).toContain("Launch your campaign: https://autogtm.tech/chad-gtm/X");
    expect(mail.text).not.toMatch(/other plan/);
    expect(mail.text.match(/chad-gtm\/X/g)).toHaveLength(1);
  });

  it("says 'we didn't start your other plan' only when approval started one", () => {
    const none = buildApprovalEmail({ appUrl, runId: "X", launch: { kind: "none" }, notStarted: [{ runId: "Y", name: "Beta" }] });
    expect(none.text).toContain("You have another plan ready. Open it to launch it:");
    expect(none.text).not.toContain("We didn't start");
    const live = buildApprovalEmail({ appUrl, launch: { kind: "live", runId: "X" }, notStarted: [{ runId: "Y", name: "Beta" }, { runId: "X", name: "Acme" }] });
    expect(live.text).toContain("We didn't start your other plan. Open it to launch it:");
    expect(live.text).toContain("- Beta: https://autogtm.tech/chad-gtm/Y");
    expect(live.text).not.toContain("- Acme");
  });

  it("asks for missing details on the plan page (Settings does not start the plan)", () => {
    const mail = buildApprovalEmail({ appUrl, launch: { kind: "details", runId: "X", missing: ["postalAddress"] } });
    expect(mail.text).toContain("Add them on your plan page and your campaign starts on its own.");
    const booking = buildApprovalEmail({ appUrl, launch: { kind: "details", runId: "X", missing: ["bookingUrl"] } });
    expect(booking.text).toContain("Add it on your plan page and your campaign starts on its own.");
  });
});

describe("approval outcome for the admin", () => {
  it("words each outcome", () => {
    expect(approvalOutcomeText({ kind: "launching", runId: "r" })).toBe("Approved. Launching their campaign now.");
    expect(approvalOutcomeText({ kind: "live", runId: "r" })).toBe("Approved. Their campaign is now live.");
    expect(approvalOutcomeText({ kind: "details", runId: "r", missing: ["bookingUrl"] })).toBe(
      "Approved. Waiting for their booking link.",
    );
    expect(approvalOutcomeText({ kind: "details", runId: "r", missing: ["bookingUrl", "postalAddress"] })).toBe(
      "Approved. Waiting for their booking link, and their company name and postal address.",
    );
    expect(approvalOutcomeText({ kind: "none" })).toBe("Approved. They haven't set up a campaign yet.");
    expect(approvalOutcomeText({ kind: "none" }, false, true)).toBe(
      "Approved. Nothing was waiting to launch. They can launch their plan themselves.",
    );
    expect(approvalOutcomeText({ kind: "none" }, true, true)).toBe("Approved. Their campaigns can send again.");
    expect(approvalOutcomeText({ kind: "failed", retrying: true })).toMatch(/retry it automatically/);
  });

  it("turns one launch attempt into a note", () => {
    expect(approvalNoteFor({ runId: "a", event: "launched" })).toEqual({ kind: "live", runId: "a" });
    expect(approvalNoteFor({ runId: "a", event: "still_launching" })).toEqual({ kind: "starting", runId: "a" });
    expect(approvalNoteFor({ runId: "a", event: "linked_not_started" })).toEqual({ kind: "paused", runId: "a" });
    expect(approvalNoteFor({ runId: "a", event: "blocked", phase: "needs_details", missing: ["bookingUrl"] })).toEqual({
      kind: "details",
      runId: "a",
      missing: ["bookingUrl"],
    });
    expect(approvalNoteFor({ runId: "a", event: "blocked", phase: "needs_research" })).toEqual({ kind: "research", runId: "a" });
    expect(approvalNoteFor({ runId: "a", event: "error", retrying: true })).toMatchObject({ kind: "failed", retrying: true });
    expect(approvalNoteFor({ runId: "a", event: "launch_failed", reason: "x" })).toEqual({ kind: "failed", runId: "a", reason: "x" });
  });
});

describe("approvals list status", () => {
  const rec = (over: Partial<ApprovalLaunchRecord>): ApprovalLaunchRecord => ({
    state: "done",
    note: { kind: "live", runId: "r1" },
    approvedAt: "2026-11-09T10:00:00.000Z",
    attempts: 1,
    nextAttemptAt: null,
    emailPending: false,
    reapproved: false,
    notStarted: [],
    updatedAt: "2026-11-09T10:00:00.000Z",
    ...over,
  });

  it("shows live, launching, waiting for details, retrying and failed", () => {
    const run = { id: "r1", campaignId: null };
    expect(approvalLaunchView(rec({}), { id: "r1", campaignId: "c1" })).toMatchObject({ status: "live", label: "Live" });
    expect(approvalLaunchView(rec({ state: "launching", note: { kind: "launching", runId: "r1" } }), run)).toMatchObject({
      status: "launching",
    });
    expect(approvalLaunchView(rec({ note: { kind: "details", runId: "r1", missing: ["bookingUrl"] } }), run)).toMatchObject({
      status: "waiting",
      label: "Waiting for details",
      detail: "Needs their booking link.",
    });
    expect(
      approvalLaunchView(rec({ state: "retrying", note: { kind: "failed", runId: "r1", reason: "busy", retrying: true } }), run),
    ).toMatchObject({ status: "retrying", detail: "busy" });
    expect(approvalLaunchView(rec({ note: { kind: "failed", runId: "r1", reason: "none left" } }), run)).toMatchObject({
      status: "failed",
      label: "Launch failed",
    });
    expect(approvalLaunchView(null, run)).toBeNull();
  });

  it("picks each user's latest approval, and reads the raw stored record", () => {
    const older = rec({ approvedAt: "2026-10-01T00:00:00.000Z", note: { kind: "failed", runId: "a" } });
    const newer = rec({ state: "launching", note: { kind: "launching", runId: "b" } });
    const map = latestApprovalLaunchByUser([
      { id: "b", userId: "u1", campaignId: null, record: newer },
      { id: "a", userId: "u1", campaignId: null, record: older },
      { id: "junk", userId: "u2", campaignId: null, record: { state: "weird" } },
    ]);
    expect(map.get("u1")).toMatchObject({ status: "launching", runId: "b" });
    expect(map.has("u2")).toBe(false);
    expect(readApprovalLaunch({ approvalLaunch: newer })?.state).toBe("launching");
  });
});

describe("waiting-for-approval copy", () => {
  it("says the latest plan launches on its own once approved", () => {
    expect(approvalBannerText(true)).toMatch(/latest plan launches on its own/);
    expect(approvalBannerText(false)).toMatch(/latest plan launches on its own/);
  });
});

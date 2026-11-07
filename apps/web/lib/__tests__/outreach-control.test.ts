import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_SETTINGS_LOCKED_ERROR,
  CAMPAIGN_ARCHIVED_START_ERROR,
  CAMPAIGN_COMPLETED_START_ERROR,
  CAMPAIGN_UNARCHIVE_ERROR,
  RETRY_FAILED_ARCHIVED_ERROR,
  autopilotSettingsLockError,
  campaignCommandError,
  retryableFailedLead,
  runStatusForCampaign,
} from "../outreach-control";

describe("runStatusForCampaign", () => {
  it("maps the campaign status to the run mirror", () => {
    expect(runStatusForCampaign("running", false)).toBe("active");
    expect(runStatusForCampaign("scheduled", false)).toBe("active");
    expect(runStatusForCampaign("paused", false)).toBe("paused");
    expect(runStatusForCampaign("draft", false)).toBe("paused");
    expect(runStatusForCampaign("completed", false)).toBe("completed");
    expect(runStatusForCampaign("archived", false)).toBe("completed");
    expect(runStatusForCampaign("running", true)).toBe("completed");
  });
});

describe("campaignCommandError", () => {
  const c = (status: string, deletedAt: string | null = null) => ({ status, deletedAt });

  it("start and resume are refused on completed and archived campaigns", () => {
    expect(campaignCommandError(c("completed"), "resume")).toBe(CAMPAIGN_COMPLETED_START_ERROR);
    expect(campaignCommandError(c("completed"), "start")).toBe(CAMPAIGN_COMPLETED_START_ERROR);
    expect(campaignCommandError(c("archived"), "resume")).toBe(CAMPAIGN_ARCHIVED_START_ERROR);
    expect(campaignCommandError(c("paused"), "resume")).toBeNull();
    expect(campaignCommandError(c("draft"), "start")).toBeNull();
  });

  it("a deleted campaign is not found for every command", () => {
    for (const cmd of ["start", "resume", "pause", "archive", "delete", "duplicate", "unarchive", "retry_failed"] as const) {
      expect(campaignCommandError(c("archived", "2026-11-01T00:00:00.000Z"), cmd)).toBe("Campaign not found");
    }
  });

  it("pause only from running or scheduled", () => {
    expect(campaignCommandError(c("running"), "pause")).toBeNull();
    expect(campaignCommandError(c("scheduled"), "pause")).toBeNull();
    expect(campaignCommandError(c("completed"), "pause")).not.toBeNull();
  });

  it("unarchive is allowed only from archived", () => {
    expect(campaignCommandError(c("archived"), "unarchive")).toBeNull();
    for (const s of ["running", "paused", "completed", "draft", "scheduled"]) {
      expect(campaignCommandError(c(s), "unarchive")).toBe(CAMPAIGN_UNARCHIVE_ERROR);
    }
  });

  it("retry_failed is refused on archived, draft and scheduled campaigns", () => {
    expect(campaignCommandError(c("archived"), "retry_failed")).toBe(RETRY_FAILED_ARCHIVED_ERROR);
    expect(campaignCommandError(c("draft"), "retry_failed")).not.toBeNull();
    expect(campaignCommandError(c("scheduled"), "retry_failed")).not.toBeNull();
    for (const s of ["completed", "paused", "running"]) expect(campaignCommandError(c(s), "retry_failed")).toBeNull();
  });
});

describe("retryableFailedLead", () => {
  it("only failed leads, and never one whose email bounced", () => {
    expect(retryableFailedLead({ status: "failed" }, [{ status: "failed" }])).toBe(true);
    expect(retryableFailedLead({ status: "failed" }, [])).toBe(true);
    expect(retryableFailedLead({ status: "failed" }, [{ status: "sent" }, { status: "bounced" }])).toBe(false);
    expect(retryableFailedLead({ status: "sent" }, [])).toBe(false);
  });
});

describe("autopilotSettingsLockError (#48/#52)", () => {
  const current = {
    dailyLimit: 60,
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    sendingTimezone: "America/New_York",
    businessDaysOnly: true,
    stopOnReply: true,
    minDelaySec: 45,
    maxDelaySec: 120,
  };
  const user = { isAdmin: false, isAutopilot: true, current };

  it("refuses a non-admin daily limit change on an Autopilot campaign", () => {
    expect(autopilotSettingsLockError({ ...user, input: { dailyLimit: 2000 } })).toBe(AUTOPILOT_SETTINGS_LOCKED_ERROR);
  });

  it("refuses turning stop-on-reply off, a timezone change and a gap change", () => {
    expect(autopilotSettingsLockError({ ...user, input: { stopOnReply: false } })).toBe(AUTOPILOT_SETTINGS_LOCKED_ERROR);
    expect(autopilotSettingsLockError({ ...user, input: { sendingTimezone: "Europe/Berlin" } })).toBe(
      AUTOPILOT_SETTINGS_LOCKED_ERROR,
    );
    expect(autopilotSettingsLockError({ ...user, input: { minDelaySec: 60 } })).toBe(AUTOPILOT_SETTINGS_LOCKED_ERROR);
  });

  it("allows the same values resubmitted and a name-only change", () => {
    expect(autopilotSettingsLockError({ ...user, input: { ...current } })).toBeNull();
    expect(autopilotSettingsLockError({ ...user, input: {} })).toBeNull();
    expect(autopilotSettingsLockError({ ...user, input: { name: "New name" } as never })).toBeNull();
  });

  it("allows admins and manual campaigns", () => {
    expect(autopilotSettingsLockError({ ...user, isAdmin: true, input: { dailyLimit: 2000, stopOnReply: false } })).toBeNull();
    expect(autopilotSettingsLockError({ ...user, isAutopilot: false, input: { dailyLimit: 2000 } })).toBeNull();
  });
});

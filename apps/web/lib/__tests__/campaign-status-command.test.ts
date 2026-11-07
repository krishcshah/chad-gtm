import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions", () => ({ campaignAction: vi.fn(), duplicateCampaignToDraft: vi.fn() }));

import { canRetryFailed, statusCommand } from "../../app/(app)/campaigns/campaign-actions";

describe("statusCommand (#54)", () => {
  it("keeps draft, running, paused and scheduled as they were", () => {
    expect(statusCommand("draft")).toEqual({ kind: "draft", label: "Continue setup" });
    expect(statusCommand("running")).toEqual({ kind: "command", command: "pause", label: "Pause" });
    expect(statusCommand("paused")).toEqual({ kind: "command", command: "resume", label: "Resume" });
    expect(statusCommand("scheduled")).toEqual({ kind: "command", command: "resume", label: "Start now" });
  });

  it("a completed manual campaign is duplicated to run again", () => {
    expect(statusCommand("completed")).toEqual({ kind: "duplicate", label: "Duplicate to run again" });
  });

  it("a completed Autopilot campaign links to its run", () => {
    expect(statusCommand("completed", { autopilotRunId: "r1" })).toEqual({
      kind: "link",
      href: "/chad-gtm/r1",
      label: "Open in Autopilot",
    });
  });

  it("an archived campaign is unarchived, after a confirm", () => {
    expect(statusCommand("archived")).toEqual({ kind: "command", command: "unarchive", label: "Unarchive", confirm: true });
  });

  it("nothing returns 'Start again' or resumes a completed or archived campaign", () => {
    for (const s of ["draft", "running", "paused", "scheduled", "completed", "archived", "unknown"]) {
      for (const runId of [null, "r1"]) {
        const c = statusCommand(s, { autopilotRunId: runId });
        expect(c.label).not.toBe("Start again");
        if (s === "completed" || s === "archived") expect(c.kind === "command" && c.command === "resume").toBe(false);
      }
    }
  });

  it("offers Retry failed leads only for running, paused or completed campaigns with failures", () => {
    expect(canRetryFailed("completed", 3)).toBe(true);
    expect(canRetryFailed("paused", 1)).toBe(true);
    expect(canRetryFailed("running", 1)).toBe(true);
    expect(canRetryFailed("completed", 0)).toBe(false);
    expect(canRetryFailed("archived", 3)).toBe(false);
    expect(canRetryFailed("draft", 3)).toBe(false);
  });
});

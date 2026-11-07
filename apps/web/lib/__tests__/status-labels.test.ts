import { describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import { CAMPAIGN_STATUS_LABEL, campaignStatusLabel } from "../status-labels";

describe("campaignStatusLabel (#96)", () => {
  it("shows a running campaign as Live, like Autopilot", () => {
    expect(campaignStatusLabel("running")).toBe("Live");
  });

  it("has a label for each of the 6 campaign statuses", () => {
    const statuses = schema.campaigns.status.enumValues;
    expect(statuses).toHaveLength(6);
    for (const s of statuses) {
      expect(CAMPAIGN_STATUS_LABEL[s]).toBeTruthy();
      expect(campaignStatusLabel(s)).not.toMatch(/_/);
    }
    expect(campaignStatusLabel("draft")).toBe("Draft");
    expect(campaignStatusLabel("archived")).toBe("Archived");
  });

  it("humanises an unknown value", () => {
    expect(campaignStatusLabel("needs_input")).toBe("Needs input");
    expect(campaignStatusLabel("")).toBe("");
  });
});

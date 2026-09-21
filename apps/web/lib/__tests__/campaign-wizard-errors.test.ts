import { describe, expect, it } from "vitest";
import { CAMPAIGN_POSTAL_REQUIRED_ERROR } from "../campaign-start-guard";
import {
  firstFailingCampaignField,
  firstFailingCampaignStep,
  isPostalComplianceError,
} from "../campaign-wizard-errors";

describe("campaign wizard field errors", () => {
  it("jumps to the earliest step that owns a failing field", () => {
    const fieldErrors = {
      maxDelaySec: ["Max delay must be ≥ min delay"],
      sendingWindowStart: ["Use HH:MM"],
      templateId: ["Choose a template"],
    };
    expect(firstFailingCampaignField(fieldErrors)).toBe("templateId");
    expect(firstFailingCampaignStep(fieldErrors)).toBe(4);
    expect(firstFailingCampaignStep({ sendingWindowEnd: ["Use HH:MM"] })).toBe(5);
  });

  it("treats the Forge postal string as a settings CTA", () => {
    expect(isPostalComplianceError(CAMPAIGN_POSTAL_REQUIRED_ERROR)).toBe(true);
    expect(isPostalComplianceError("Use HH:MM", { postalAddress: ["missing"] })).toBe(true);
    expect(isPostalComplianceError("Lead list is required")).toBe(false);
  });
});

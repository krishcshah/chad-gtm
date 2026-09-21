import { describe, expect, it } from "vitest";
import { CAMPAIGN_POSTAL_REQUIRED_ERROR, campaignStartPostalError } from "../campaign-start-guard";

describe("campaignStartPostalError", () => {
  it("blocks a missing or blank postal address", () => {
    expect(campaignStartPostalError(null)).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError(undefined)).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError("")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError(" \n\t ")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
  });

  it("allows a physical address after trim", () => {
    expect(campaignStartPostalError("  1 Main St, Austin, TX 78701  ")).toBeNull();
  });
});

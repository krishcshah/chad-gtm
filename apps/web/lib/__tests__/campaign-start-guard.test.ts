import { describe, expect, it } from "vitest";
import { CAMPAIGN_POSTAL_REQUIRED_ERROR, campaignStartPostalError } from "../campaign-start-guard";

describe("campaignStartPostalError", () => {
  it("never blocks — postal is optional for staging", () => {
    expect(campaignStartPostalError(null)).toBeNull();
    expect(campaignStartPostalError(undefined)).toBeNull();
    expect(campaignStartPostalError("")).toBeNull();
    expect(campaignStartPostalError(" \n\t ")).toBeNull();
    expect(campaignStartPostalError("1 Main St")).toBeNull();
  });

  it("keeps the legacy error string for UI classification only", () => {
    expect(CAMPAIGN_POSTAL_REQUIRED_ERROR).toContain("postal");
  });
});

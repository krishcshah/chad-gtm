import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_POSTAL_REQUIRED_ERROR,
  campaignIdentityStartError,
  campaignStartPostalError,
  isUsablePostalAddress,
} from "../campaign-start-guard";

describe("campaignStartPostalError (CAN-SPAM)", () => {
  it("blocks sending without a postal address", () => {
    expect(campaignStartPostalError(null)).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError(undefined)).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError("")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError(" \n\t ")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
  });

  it("blocks placeholders that can't be a physical address", () => {
    expect(campaignStartPostalError("n/a")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError("Remote company")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(campaignStartPostalError("1 Main")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
  });

  it("allows a real street or PO box address", () => {
    expect(campaignStartPostalError("1 Main St, Springfield, IL 62701")).toBeNull();
    expect(campaignStartPostalError("PO Box 123\nAustin TX")).toBeNull();
    expect(campaignStartPostalError("  Hauptstr. 5, 60311 Frankfurt  ")).toBeNull();
    expect(isUsablePostalAddress("221B Baker Street, London")).toBe(true);
  });

  it("keeps the named error the wizard classifies", () => {
    expect(CAMPAIGN_POSTAL_REQUIRED_ERROR).toContain("postal");
  });
});

describe("one identity rule (#18)", () => {
  it("rejects addresses the Autopilot rule rejects", () => {
    expect(campaignStartPostalError("1 Main St")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR); // 9 characters
    expect(campaignStartPostalError("Main Street, Berlin")).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR); // no digit
    expect(isUsablePostalAddress("TBD")).toBe(false);
  });

  it("campaignIdentityStartError needs a company name too", () => {
    expect(
      campaignIdentityStartError({ companyName: "", postalAddress: "1 Main St, Springfield, IL 62701" }),
    ).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(
      campaignIdentityStartError({ companyName: "Acme Inc.", postalAddress: "1 Main St" }),
    ).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(
      campaignIdentityStartError({ companyName: "Acme Inc.", postalAddress: "1 Main St, Springfield, IL 62701" }),
    ).toBeNull();
  });
});

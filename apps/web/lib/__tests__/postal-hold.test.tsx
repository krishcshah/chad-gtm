import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { POSTAL_ADDRESS_HOLD_REASON } from "@smartreach/email-engine/processor";
import { POSTAL_SETTINGS_HREF, isSendingStatus, postalHoldFrom } from "../postal-hold-policy";
import { PostalHoldNotice, postalHoldHeadline } from "../../app/(app)/postal-hold-notice";

describe("postal-address hold", () => {
  it("is held when the address is blank and campaigns are sending or jobs are held", () => {
    expect(postalHoldFrom({ postalAddress: "", sendingCampaigns: 2, heldJobs: 0 })).toEqual({
      held: true,
      campaigns: 2,
      heldJobs: 0,
    });
    expect(postalHoldFrom({ postalAddress: "   ", sendingCampaigns: 0, heldJobs: 5 }).held).toBe(true);
    expect(postalHoldFrom({ postalAddress: null, sendingCampaigns: 1, heldJobs: 0 }).held).toBe(true);
  });

  it("is not held with an address (stale last_error clears on the next engine pass) or nothing sending", () => {
    expect(postalHoldFrom({ postalAddress: "1 Main St, Springfield 12345", sendingCampaigns: 3, heldJobs: 4 }).held).toBe(false);
    expect(postalHoldFrom({ postalAddress: "", sendingCampaigns: 0, heldJobs: 0 }).held).toBe(false);
  });

  it("counts running and scheduled campaigns as sending", () => {
    expect(isSendingStatus("running")).toBe(true);
    expect(isSendingStatus("scheduled")).toBe(true);
    expect(isSendingStatus("paused")).toBe(false);
    expect(isSendingStatus("draft")).toBe(false);
  });

  it("reads the same hold reason the engine writes", () => {
    expect(POSTAL_ADDRESS_HOLD_REASON).toMatch(/postal address/);
  });
});

describe("PostalHoldNotice", () => {
  it("renders nothing when not held", () => {
    expect(renderToStaticMarkup(<PostalHoldNotice hold={{ held: false, campaigns: 0, heldJobs: 0 }} />)).toBe("");
  });

  it("explains the pause and links to Settings → Compliance", () => {
    const html = renderToStaticMarkup(<PostalHoldNotice hold={{ held: true, campaigns: 2, heldJobs: 37 }} />);
    expect(html).toContain("Your 2 campaigns are paused: add your business postal address.");
    expect(html).toContain("37 emails are waiting");
    expect(html).toContain(`href="${POSTAL_SETTINGS_HREF}"`);
    expect(POSTAL_SETTINGS_HREF).toBe("/settings#postalAddress");
    expect(html).toContain("Settings → Compliance");
  });

  it("uses campaign wording on a campaign page", () => {
    expect(postalHoldHeadline({ campaigns: 1 }, "campaign")).toMatch(/^This campaign is paused/);
    expect(postalHoldHeadline({ campaigns: 1 }, "account")).toMatch(/^Your campaign is paused/);
  });
});

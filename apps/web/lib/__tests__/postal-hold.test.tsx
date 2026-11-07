import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { POSTAL_ADDRESS_HOLD_REASON } from "@smartreach/email-engine/processor";
import { POSTAL_SETTINGS_HREF, isSendingStatus, postalHoldFrom } from "../postal-hold-policy";
import { PostalHoldNotice, postalHoldHeadline } from "../../app/(app)/postal-hold-notice";
import { CampaignStatusBadge } from "../../app/(app)/campaign-status-badge";

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
    expect(html).toContain("Your 2 campaigns are held: add your business postal address.");
    expect(html).toContain("37 emails are waiting");
    expect(html).toContain(`href="${POSTAL_SETTINGS_HREF}"`);
    expect(POSTAL_SETTINGS_HREF).toBe("/settings#postalAddress");
    expect(html).toContain("Settings → Compliance");
  });

  it("uses campaign wording on a campaign page", () => {
    expect(postalHoldHeadline({ campaigns: 1 }, "campaign")).toMatch(/^This campaign is held/);
    expect(postalHoldHeadline({ campaigns: 1 }, "account")).toMatch(/^Your campaign is held/);
  });
});

describe("incomplete postal address (#18)", () => {
  it("warns that campaigns can't start or resume, with a Settings link", () => {
    const html = renderToStaticMarkup(
      <PostalHoldNotice hold={{ held: false, campaigns: 1, heldJobs: 0, incomplete: true }} />,
    );
    expect(html).toContain("Your postal address looks incomplete.");
    expect(html).toContain("can&#x27;t start or resume");
    expect(html).toContain(`href="${POSTAL_SETTINGS_HREF}"`);
    expect(html).toContain('role="status"');
  });

  it("postalHoldFrom never sets incomplete", () => {
    expect(postalHoldFrom({ postalAddress: "TBD", sendingCampaigns: 1, heldJobs: 0 })).toEqual({
      held: false,
      campaigns: 1,
      heldJobs: 0,
    });
  });
});

describe("CampaignStatusBadge (#19)", () => {
  const html = (status: string, held: boolean) => renderToStaticMarkup(<CampaignStatusBadge status={status} held={held} />);

  it("shows the hold instead of running or scheduled", () => {
    expect(html("running", true)).toContain("Held: needs postal address");
    expect(html("scheduled", true)).toContain("Held: needs postal address");
    expect(html("running", true)).toContain("bg-warning-soft");
  });

  it("shows the plain status otherwise, with the shared labels (#96)", () => {
    expect(html("paused", true)).toContain(">Paused<");
    expect(html("paused", true)).not.toContain("Held");
    expect(html("running", false)).toContain(">Live<");
    expect(html("running", false)).not.toContain("Held");
  });
});

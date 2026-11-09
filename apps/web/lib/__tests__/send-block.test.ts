import { describe, expect, it } from "vitest";
import { SEND_BLOCK_REASONS } from "@smartreach/email-engine/scheduler";
import { describeSendBlock, type SendBlockCampaign } from "../send-block";
import { POSTAL_SETTINGS_HREF } from "../postal-hold-policy";

function campaign(over: Partial<SendBlockCampaign> = {}): SendBlockCampaign {
  return {
    id: "c1",
    status: "running",
    sendBlockReason: "outside-window",
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    sendingTimezone: "UTC",
    businessDaysOnly: false,
    ...over,
  };
}

// Wednesday 2026-11-04
const WED_MORNING = new Date("2026-11-04T07:00:00Z");
const WED_NIGHT = new Date("2026-11-04T20:00:00Z");

describe("describeSendBlock", () => {
  it("says nothing for campaigns that are not sending or have no reason", () => {
    expect(describeSendBlock(campaign({ status: "paused" }))).toBeNull();
    expect(describeSendBlock(campaign({ status: "draft" }))).toBeNull();
    expect(describeSendBlock(campaign({ sendBlockReason: null }))).toBeNull();
    expect(describeSendBlock(campaign({ sendBlockReason: "something-new" }))).toBeNull();
  });

  it("outside-window is neutral and names the next start", () => {
    expect(describeSendBlock(campaign(), WED_MORNING)).toEqual({
      tone: "neutral",
      message: "Waiting for sending hours. Next send around 09:00 UTC.",
    });
    expect(describeSendBlock(campaign(), WED_NIGHT)?.message).toBe(
      "Waiting for sending hours. Next send around 09:00 UTC tomorrow.",
    );
  });

  it("outside-window on a Saturday in Berlin with weekdays only says Monday", () => {
    const sat = new Date("2026-11-07T12:00:00Z");
    const view = describeSendBlock(
      campaign({ sendingTimezone: "Europe/Berlin", businessDaysOnly: true }),
      sat,
    );
    expect(view?.tone).toBe("neutral");
    expect(view?.message).toBe("Waiting for sending hours. Next send around 09:00 Europe/Berlin on Monday.");
  });

  it("Friday after the window with weekdays only also says Monday", () => {
    const friNight = new Date("2026-11-06T19:00:00Z");
    expect(describeSendBlock(campaign({ businessDaysOnly: true }), friNight)?.message).toMatch(/on Monday\.$/);
  });

  it("daily-limit is neutral", () => {
    expect(describeSendBlock(campaign({ sendBlockReason: "daily-limit" }))).toEqual({
      tone: "neutral",
      message: "Daily limit reached. Sending resumes tomorrow.",
    });
  });

  it("owner-not-approved and all-paused are warnings that link to support", () => {
    for (const reason of ["owner-not-approved", "all-paused", "no-senders"]) {
      const v = describeSendBlock(campaign({ sendBlockReason: reason }));
      expect(v?.tone).toBe("warning");
      expect(v?.href).toBe("/support");
    }
    expect(describeSendBlock(campaign({ sendBlockReason: "owner-not-approved" }))?.message).toBe(
      "Sending is paused by AutoGTM. Contact support to turn it back on.",
    );
  });

  it("skipPostal hides the postal reason (the hold notice covers it)", () => {
    const c = campaign({ sendBlockReason: "missing-postal-address" });
    expect(describeSendBlock(c, WED_MORNING, { skipPostal: true })).toBeNull();
    expect(describeSendBlock(c)).toMatchObject({ tone: "warning", href: POSTAL_SETTINGS_HREF });
  });

  it("missing sequence links to the sequence tab", () => {
    expect(describeSendBlock(campaign({ sendBlockReason: "missing-list-or-template" }))?.href).toBe(
      "/campaigns/c1?tab=sequence",
    );
  });

  it("writing-unavailable is a warning that says nothing generic is sent", () => {
    const v = describeSendBlock(campaign({ sendBlockReason: "writing-unavailable" }));
    expect(v?.tone).toBe("warning");
    expect(v?.href).toBe("/support");
    expect(v?.message).toMatch(/No generic emails go out/);
  });

  it("has copy for every reason the engine records", () => {
    for (const reason of SEND_BLOCK_REASONS) {
      const v = describeSendBlock(campaign({ sendBlockReason: reason }), WED_MORNING);
      expect(v, reason).not.toBeNull();
      expect(v!.message.length).toBeGreaterThan(10);
    }
  });
});

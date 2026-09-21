import { describe, expect, it } from "vitest";
import { campaignCreateSchema } from "../index";

const base = {
  name: "Launch",
  leadListId: "list-1",
  senderIds: ["sender-1"],
  templateId: "tpl-1",
  startMode: "now" as const,
  sendingTimezone: "UTC",
  dailyLimit: 100,
  minDelaySec: 90,
  maxDelaySec: 240,
  maxEmailsPerSenderPerDay: 50,
};

describe("campaignCreateSchema sending window", () => {
  it("coerces Chrome HH:MM:SS values to HH:MM", () => {
    const parsed = campaignCreateSchema.safeParse({
      ...base,
      sendingWindowStart: "09:00:00",
      sendingWindowEnd: "17:30:00",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sendingWindowStart).toBe("09:00");
      expect(parsed.data.sendingWindowEnd).toBe("17:30");
    }
  });

  it("keeps HH:MM and still rejects a bad clock", () => {
    const ok = campaignCreateSchema.safeParse({
      ...base,
      sendingWindowStart: "09:00",
      sendingWindowEnd: "17:30",
    });
    expect(ok.success).toBe(true);

    const bad = campaignCreateSchema.safeParse({
      ...base,
      sendingWindowStart: "99:00:00",
      sendingWindowEnd: "17:30",
    });
    expect(bad.success).toBe(false);
  });
});
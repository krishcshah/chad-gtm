import { describe, expect, it } from "vitest";
import {
  campaignCreateSchema,
  campaignDraftSchema,
  campaignPublishSchema,
} from "../index";

const full = {
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

describe("campaignDraftSchema", () => {
  it("accepts name-only and leaves list/template unset", () => {
    const parsed = campaignDraftSchema.safeParse({ name: "My draft" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("My draft");
      expect(parsed.data.leadListId).toBeUndefined();
      expect(parsed.data.templateId).toBeUndefined();
      expect(parsed.data.senderIds).toBeUndefined();
    }
  });

  it("turns empty name into Untitled campaign", () => {
    const parsed = campaignDraftSchema.safeParse({ name: "  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.name).toBe("Untitled campaign");
  });

  it("allows null leadListId/templateId and empty senderIds", () => {
    const parsed = campaignDraftSchema.safeParse({
      leadListId: null,
      templateId: null,
      senderIds: [],
      wizardStep: 3,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.leadListId).toBeNull();
      expect(parsed.data.templateId).toBeNull();
      expect(parsed.data.senderIds).toEqual([]);
      expect(parsed.data.wizardStep).toBe(3);
    }
  });

  it("coerces Chrome HH:MM:SS on draft windows", () => {
    const parsed = campaignDraftSchema.safeParse({
      sendingWindowStart: "09:00:00",
      sendingWindowEnd: "17:30:00",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sendingWindowStart).toBe("09:00");
      expect(parsed.data.sendingWindowEnd).toBe("17:30");
    }
  });

  it("rejects wizardStep outside 1..20", () => {
    expect(campaignDraftSchema.safeParse({ wizardStep: 0 }).success).toBe(false);
    expect(campaignDraftSchema.safeParse({ wizardStep: 21 }).success).toBe(false);
  });
});

describe("campaignPublishSchema", () => {
  it("requires full create fields and accepts optional id", () => {
    const bare = campaignPublishSchema.safeParse({ name: "x" });
    expect(bare.success).toBe(false);

    const ok = campaignPublishSchema.safeParse({ ...full, id: "draft-1" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.id).toBe("draft-1");
  });

  it("coerces HH:MM:SS like create", () => {
    const parsed = campaignPublishSchema.safeParse({
      ...full,
      sendingWindowStart: "09:00:00",
      sendingWindowEnd: "17:00:00",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sendingWindowStart).toBe("09:00");
      expect(parsed.data.sendingWindowEnd).toBe("17:00");
    }
  });

  it("keeps create schema required for publish/start", () => {
    expect(campaignCreateSchema.safeParse({ name: "only" }).success).toBe(false);
    expect(campaignPublishSchema.safeParse({ ...full, senderIds: [] }).success).toBe(false);
  });
});

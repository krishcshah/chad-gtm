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

  it("accepts reengageContacted as a boolean only", () => {
    const on = campaignPublishSchema.safeParse({ ...full, reengageContacted: true });
    expect(on.success).toBe(true);
    if (on.success) expect(on.data.reengageContacted).toBe(true);
    const omitted = campaignPublishSchema.safeParse(full);
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.reengageContacted).toBeUndefined();
    expect(campaignPublishSchema.safeParse({ ...full, reengageContacted: "yes" }).success).toBe(false);
  });

  it("keeps create schema required for publish/start", () => {
    expect(campaignCreateSchema.safeParse({ name: "only" }).success).toBe(false);
    expect(campaignPublishSchema.safeParse({ ...full, senderIds: [] }).success).toBe(false);
  });
});

describe("per-mailbox daily limit (#20)", () => {
  it("clamps a stored 50 to the 30/day mailbox ceiling instead of rejecting it", () => {
    const create = campaignCreateSchema.safeParse(full);
    expect(create.success).toBe(true);
    if (create.success) expect(create.data.maxEmailsPerSenderPerDay).toBe(30);

    const draft = campaignDraftSchema.safeParse({ maxEmailsPerSenderPerDay: 50 });
    expect(draft.success).toBe(true);
    if (draft.success) expect(draft.data.maxEmailsPerSenderPerDay).toBe(30);
  });

  it("keeps values at or under 30 and defaults to 30", () => {
    const parsed = campaignCreateSchema.safeParse({ ...full, maxEmailsPerSenderPerDay: 12 });
    expect(parsed.success && parsed.data.maxEmailsPerSenderPerDay).toBe(12);
    const { maxEmailsPerSenderPerDay: _omit, ...rest } = full;
    const defaulted = campaignCreateSchema.safeParse(rest);
    expect(defaulted.success && defaulted.data.maxEmailsPerSenderPerDay).toBe(30);
    expect(campaignDraftSchema.safeParse({ maxEmailsPerSenderPerDay: 0 }).success).toBe(false);
  });
});

describe("gap between emails is clamped to what the engine uses", () => {
  it("raises a 5 second gap to 45 instead of rejecting it", () => {
    const draft = campaignDraftSchema.parse({ minDelaySec: 5, maxDelaySec: 10 });
    expect(draft.minDelaySec).toBe(45);
    expect(draft.maxDelaySec).toBe(45);
    const created = campaignCreateSchema.parse({
      name: "C",
      leadListId: "l1",
      senderIds: ["s1"],
      minDelaySec: 5,
      maxDelaySec: 86_400,
    });
    expect(created.minDelaySec).toBe(45);
    expect(created.maxDelaySec).toBe(3600);
  });
});

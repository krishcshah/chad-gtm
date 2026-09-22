import { describe, expect, it } from "vitest";
import { sequencePreviewSchema, sequenceSaveSchema } from "../index";

describe("sequenceSaveSchema", () => {
  it("accepts a 2-step A/B sequence", () => {
    const parsed = sequenceSaveSchema.safeParse({
      campaignId: "c1",
      steps: [
        {
          delayDays: 0,
          type: "initial",
          variants: [
            { label: "A", subject: "Hi {{first_name}}", bodyText: "{Hi|Hey}" },
            { label: "B", subject: "Hello", bodyText: "Hello" },
          ],
        },
        {
          delayDays: 3,
          type: "follow_up",
          variants: [{ subject: "Follow up", bodyText: "Just bumping" }],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.steps).toHaveLength(2);
      expect(parsed.data.steps[0]!.variants).toHaveLength(2);
      expect(parsed.data.steps[1]!.delayDays).toBe(3);
    }
  });

  it("rejects more than 20 steps", () => {
    const steps = Array.from({ length: 21 }, (_, i) => ({
      delayDays: i === 0 ? 0 : 1,
      variants: [{ subject: `S${i}`, bodyText: "x" }],
    }));
    expect(sequenceSaveSchema.safeParse({ campaignId: "c1", steps }).success).toBe(false);
  });

  it("rejects >2 variants per step", () => {
    const parsed = sequenceSaveSchema.safeParse({
      campaignId: "c1",
      steps: [
        {
          variants: [
            { subject: "A" },
            { subject: "B" },
            { subject: "C" },
          ],
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

describe("sequencePreviewSchema", () => {
  it("defaults empty fields", () => {
    const parsed = sequencePreviewSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subject).toBe("");
      expect(parsed.data.bodyHtml).toBe("");
    }
  });
});

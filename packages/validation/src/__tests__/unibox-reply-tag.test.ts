import { describe, expect, it } from "vitest";
import { setUniboxReplyTagSchema, UNIBOX_REPLY_TAG_VALUES } from "../index";

describe("setUniboxReplyTagSchema", () => {
  it("accepts each enum value and null", () => {
    for (const tag of UNIBOX_REPLY_TAG_VALUES) {
      const r = setUniboxReplyTagSchema.safeParse({ replyId: "r1", tag });
      expect(r.success).toBe(true);
    }
    expect(setUniboxReplyTagSchema.safeParse({ replyId: "r1", tag: null }).success).toBe(true);
  });

  it("rejects unknown tags and missing replyId", () => {
    expect(setUniboxReplyTagSchema.safeParse({ replyId: "r1", tag: "maybe" }).success).toBe(false);
    expect(setUniboxReplyTagSchema.safeParse({ replyId: "", tag: "won" }).success).toBe(false);
  });
});

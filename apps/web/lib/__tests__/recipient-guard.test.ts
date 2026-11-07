import { describe, expect, it } from "vitest";
import { manualReplyBlockError, SEND_ANYWAY_CONFIRM_SUFFIX, toRecipientBlock } from "../recipient-guard";

describe("manualReplyBlockError (Inbox replies)", () => {
  const global = toRecipientBlock("dana@acme.com", { level: "global", source: "unsubscribe" });
  const own = toRecipientBlock("dana@acme.com", { level: "own", source: "not_interested" });

  it("lets a reply through when nothing applies", () => {
    expect(toRecipientBlock("dana@acme.com", null)).toBeNull();
    expect(manualReplyBlockError(null, false)).toBeNull();
  });

  it("always refuses a global opt-out, even when confirmed", () => {
    const msg = "dana@acme.com unsubscribed or asked not to be contacted, so AutoGTM won't email them again.";
    expect(global).toEqual({ level: "global", message: msg });
    expect(manualReplyBlockError(global, false)).toBe(msg);
    expect(manualReplyBlockError(global, true)).toBe(msg);
  });

  it("asks for confirmation for your own blocklist, and sends once confirmed", () => {
    expect(manualReplyBlockError(own, false)).toBe("dana@acme.com is on your blocklist." + SEND_ANYWAY_CONFIRM_SUFFIX);
    expect(manualReplyBlockError(own, true)).toBeNull();
  });
});

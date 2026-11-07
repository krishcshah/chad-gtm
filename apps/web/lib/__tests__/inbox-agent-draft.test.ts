import { describe, expect, it } from "vitest";
import { latestSeenAt, requestForConversation, type OpenRequestRow } from "@/app/(app)/unibox/inbox-utils";

function req(over: Partial<OpenRequestRow>): OpenRequestRow {
  return {
    id: "req",
    replyId: null,
    leadId: null,
    campaignId: null,
    kind: "approval",
    title: "Approve reply",
    question: "",
    draftReply: "Hi Dana,",
    draftSource: "agent",
    hasPendingKnowledge: false,
    createdAt: "2026-11-06T10:00:00.000Z",
    ...over,
  };
}

describe("requestForConversation", () => {
  const conversation = { memberIds: ["r1", "r2"], latest: { leadId: "l1", campaignId: "c1" } };

  it("matches by any reply id in the conversation", () => {
    const hit = req({ id: "a", replyId: "r1" });
    expect(requestForConversation(conversation, [req({ id: "x", replyId: "r9" }), hit])).toBe(hit);
  });

  it("falls back to the same lead and campaign", () => {
    const hit = req({ id: "b", replyId: "r-elsewhere", leadId: "l1", campaignId: "c1" });
    expect(requestForConversation(conversation, [req({ id: "x", leadId: "l1", campaignId: "c2" }), hit])).toBe(hit);
  });

  it("returns null when nothing matches, or the conversation has no lead/campaign", () => {
    expect(requestForConversation(conversation, [req({ replyId: "r9", leadId: "l2", campaignId: "c1" })])).toBeNull();
    expect(
      requestForConversation({ memberIds: ["r1"], latest: { leadId: null, campaignId: null } }, [req({ leadId: null, campaignId: null })]),
    ).toBeNull();
  });
});

describe("latestSeenAt", () => {
  it("is the newest time among the lead's replies and the transcript", () => {
    expect(
      latestSeenAt(
        [{ receivedAt: "2026-11-06T10:00:00.000Z" }],
        [{ sentAt: "2026-11-06T11:00:00.000Z" }, { sentAt: "2026-11-06T09:00:00.000Z" }],
      ),
    ).toBe("2026-11-06T11:00:00.000Z");
    expect(latestSeenAt([], [])).toBeNull();
  });
});

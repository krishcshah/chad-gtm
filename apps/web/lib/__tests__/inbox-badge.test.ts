import { describe, expect, it } from "vitest";
import {
  awaitingContext,
  buildInbox,
  buildInboxConversations,
  createTtlMemo,
  inboxSignals,
  outboundKey,
  type InboxIndexRow,
} from "../unibox-inbox";

function row(partial: Partial<InboxIndexRow> & { id: string; receivedAt: string }): InboxIndexRow {
  return {
    leadId: "lead-1",
    campaignId: "camp-1",
    fromName: "Ada Lovelace",
    fromEmail: "ada@example.com",
    subject: "Intro",
    snippet: "hello",
    readAt: null,
    tag: null,
    tagSource: null,
    agentStatus: null,
    campaignName: "Spring outreach",
    ...partial,
  };
}

describe("buildInbox signals (sidebar badge numbers)", () => {
  const rows = [
    row({ id: "a1", leadId: "lead-a", campaignId: "camp-1", receivedAt: "2026-10-05T10:00:00.000Z" }),
    row({ id: "b1", leadId: "lead-b", campaignId: "camp-2", tag: "interested", tagSource: "human", receivedAt: "2026-10-04T10:00:00.000Z" }),
    row({ id: "c1", leadId: "lead-c", campaignId: "camp-2", agentStatus: "held", receivedAt: "2026-10-03T10:00:00.000Z" }),
    row({ id: "d1", leadId: "lead-d", campaignId: "camp-1", receivedAt: "2026-10-02T10:00:00.000Z" }),
  ];
  const ctx = awaitingContext({
    lastOutboundAt: { [outboundKey("lead-d", "camp-1")]: "2026-10-02T11:00:00.000Z" },
    lastOutboundByReply: {},
  });

  it("matches loadInboxSignals' numbers for the same rows", () => {
    const expected = inboxSignals(buildInboxConversations(rows, ctx));
    expect(buildInbox(rows, ctx).signals).toEqual(expected);
  });

  it("ignores the view, tag, campaign, search and paging", () => {
    const expected = buildInbox(rows, ctx).signals;
    expect(buildInbox(rows, ctx, { view: "unread", tag: "interested", campaignId: "camp-2", q: "zzz", pageSize: 1 }).signals).toEqual(expected);
  });
});

describe("createTtlMemo", () => {
  it("returns a value until it is ttl old", () => {
    const memo = createTtlMemo<number>(1000, 10);
    memo.set("k", 1, 0);
    expect(memo.get("k", 999)).toBe(1);
    expect(memo.get("k", 1000)).toBeUndefined();
    // Expired entries are dropped, not revived.
    expect(memo.get("k", 0)).toBeUndefined();
  });

  it("treats a value written in the future (clock moved back) as stale", () => {
    const memo = createTtlMemo<number>(1000, 10);
    memo.set("k", 1, 5000);
    expect(memo.get("k", 4000)).toBeUndefined();
  });

  it("keeps keys apart and a newer write wins", () => {
    const memo = createTtlMemo<number>(1000, 10);
    memo.set("user-1\u0000ws-1", 1, 0);
    memo.set("user-2\u0000ws-1", 2, 0);
    memo.set("user-1\u0000ws-1", 3, 10);
    expect(memo.get("user-1\u0000ws-1", 20)).toBe(3);
    expect(memo.get("user-2\u0000ws-1", 20)).toBe(2);
  });

  it("evicts the oldest write past the size limit", () => {
    const memo = createTtlMemo<number>(1000, 2);
    memo.set("a", 1, 0);
    memo.set("b", 2, 0);
    memo.set("a", 3, 1); // rewriting "a" makes "b" the oldest
    memo.set("c", 4, 2);
    expect(memo.get("b", 3)).toBeUndefined();
    expect(memo.get("a", 3)).toBe(3);
    expect(memo.get("c", 3)).toBe(4);
  });

  it("forget(prefix) drops only matching keys", () => {
    const memo = createTtlMemo<number>(1000, 10);
    memo.set("user-1\u0000ws-1", 1, 0);
    memo.set("user-1\u0000ws-2", 2, 0);
    memo.set("user-10\u0000ws-1", 3, 0);
    memo.forget("user-1\u0000");
    expect(memo.get("user-1\u0000ws-1", 1)).toBeUndefined();
    expect(memo.get("user-1\u0000ws-2", 1)).toBeUndefined();
    expect(memo.get("user-10\u0000ws-1", 1)).toBe(3);
  });
});

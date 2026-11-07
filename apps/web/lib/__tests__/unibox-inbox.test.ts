import { describe, expect, it } from "vitest";
import {
  awaitingContext,
  buildInbox,
  buildInboxConversations,
  inboxSignals,
  INBOX_PAGE_SIZE,
  isAwaitingReply,
  markLatestUnread,
  markRowsRead,
  outboundKey,
  type InboxContext,
  type InboxIndexRow,
} from "../unibox-inbox";

const NONE: InboxContext = { requests: [] };

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

/** One single-message conversation per lead; lead 0 is the newest. */
function manyConversations(n: number): InboxIndexRow[] {
  const base = Date.parse("2026-10-01T00:00:00.000Z");
  return Array.from({ length: n }, (_, i) =>
    row({
      id: `r${String(i).padStart(3, "0")}`,
      leadId: `lead-${i}`,
      fromEmail: `lead${i}@example.com`,
      fromName: `Lead ${i}`,
      subject: `Hello ${i}`,
      receivedAt: new Date(base - i * 60_000).toISOString(),
    }),
  );
}

describe("buildInbox paging (#88)", () => {
  it("pages 120 conversations newest first with a keyset cursor and no overlap", () => {
    const rows = manyConversations(120);
    const first = buildInbox(rows, NONE);
    expect(first.conversations).toHaveLength(INBOX_PAGE_SIZE);
    expect(first.conversations[0]?.latestId).toBe("r000");
    expect(first.nextCursor).not.toBeNull();

    const second = buildInbox(rows, NONE, { cursor: first.nextCursor });
    expect(second.conversations).toHaveLength(INBOX_PAGE_SIZE);
    expect(second.conversations[0]?.latestId).toBe("r050");
    const firstKeys = new Set(first.conversations.map((c) => c.key));
    expect(second.conversations.some((c) => firstKeys.has(c.key))).toBe(false);
    expect(second.nextCursor).not.toBeNull();

    const third = buildInbox(rows, NONE, { cursor: second.nextCursor });
    expect(third.conversations).toHaveLength(20);
    expect(third.conversations.at(-1)?.latestId).toBe("r119");
    expect(third.nextCursor).toBeNull();
  });

  it("counts every conversation in the index, not just the page", () => {
    const result = buildInbox(manyConversations(120), NONE);
    expect(result.counts.all).toBe(120);
    expect(result.counts.unread).toBe(120);
    expect(result.conversations).toHaveLength(INBOX_PAGE_SIZE);
  });

  it("search finds a conversation older than the first page, on any member's fields", () => {
    const rows = manyConversations(120);
    const base = Date.parse("2026-09-01T00:00:00.000Z");
    // An old two-message conversation: only the OLDER member mentions the term.
    rows.push(
      row({ id: "old-2", leadId: "lead-old", fromEmail: "grace@navy.mil", subject: "Re: Pricing", snippet: "thanks", receivedAt: new Date(base).toISOString() }),
      row({ id: "old-1", leadId: "lead-old", fromEmail: "grace@navy.mil", subject: "Pricing", snippet: "first", campaignName: "Navy push", receivedAt: new Date(base - 1000).toISOString() }),
    );
    for (const q of ["pricing", "GRACE@navy", "navy push"]) {
      const result = buildInbox(rows, NONE, { q });
      expect(result.conversations.map((c) => c.latestId)).toEqual(["old-2"]);
    }
    // Counts ignore the search.
    expect(buildInbox(rows, NONE, { q: "pricing" }).counts.all).toBe(121);
  });

  it("returns whole conversations: pageReplyIds holds every member id", () => {
    const rows = [
      row({ id: "a2", subject: "Re: Intro", receivedAt: "2026-10-02T10:00:00.000Z" }),
      row({ id: "a1", subject: "Intro", receivedAt: "2026-10-01T10:00:00.000Z" }),
      row({ id: "b1", leadId: "lead-2", fromEmail: "b@example.com", receivedAt: "2026-10-01T09:00:00.000Z" }),
    ];
    const result = buildInbox(rows, NONE, { pageSize: 1 });
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]?.memberIds).toEqual(["a2", "a1"]);
    expect(result.pageReplyIds).toEqual(["a2", "a1"]);
  });

  it("includes the linked conversation even when it is beyond the first page", () => {
    const rows = manyConversations(120);
    const result = buildInbox(rows, NONE, { focusReplyId: "r100" });
    expect(result.focusFound).toBe(true);
    expect(result.conversations.some((c) => c.latestId === "r100")).toBe(true);
    expect(result.pageReplyIds).toContain("r100");
    expect(buildInbox(rows, NONE, { focusReplyId: "missing" }).focusFound).toBe(false);
  });

  it("filters by campaign when any member has it", () => {
    const rows = [
      row({ id: "a2", subject: "Re: Intro", campaignId: "camp-1", receivedAt: "2026-10-02T10:00:00.000Z" }),
      row({ id: "a1", subject: "Intro", campaignId: "camp-1", receivedAt: "2026-10-01T10:00:00.000Z" }),
      row({ id: "b1", leadId: "lead-2", fromEmail: "b@example.com", campaignId: "camp-2", receivedAt: "2026-10-01T09:00:00.000Z" }),
    ];
    const result = buildInbox(rows, NONE, { campaignId: "camp-2" });
    expect(result.conversations.map((c) => c.latestId)).toEqual(["b1"]);
    expect(result.counts.all).toBe(1);
  });
});

describe("buildInbox tag filter (#89)", () => {
  it("matches a conversation by an older tagged row and still returns its newest message", () => {
    const rows = [
      row({ id: "new", subject: "Re: Intro", tag: null, receivedAt: "2026-10-02T10:00:00.000Z" }),
      row({ id: "old", subject: "Intro", tag: "interested", receivedAt: "2026-10-01T10:00:00.000Z" }),
      row({ id: "other", leadId: "lead-2", fromEmail: "b@example.com", receivedAt: "2026-10-01T09:00:00.000Z" }),
    ];
    const result = buildInbox(rows, NONE, { tag: "interested" });
    expect(result.conversations).toHaveLength(1);
    const c = result.conversations[0]!;
    expect(c.latestId).toBe("new");
    expect(c.memberIds).toEqual(["new", "old"]);
    expect(result.pageReplyIds).toEqual(["new", "old"]);
    expect(c.tag).toBe("interested");
    expect(c.tagReplyId).toBe("old");
  });

  it("does not match tag=interested when a person tagged it meeting_booked", () => {
    const rows = [
      row({ id: "new", subject: "Re: Intro", tag: "interested", tagSource: "auto", receivedAt: "2026-10-03T10:00:00.000Z" }),
      row({ id: "old", subject: "Intro", tag: "meeting_booked", tagSource: "human", receivedAt: "2026-10-01T10:00:00.000Z" }),
    ];
    expect(buildInbox(rows, NONE, { tag: "interested" }).conversations).toHaveLength(0);
    const booked = buildInbox(rows, NONE, { tag: "meeting_booked" });
    expect(booked.conversations).toHaveLength(1);
    expect(booked.conversations[0]?.latestId).toBe("new");
    expect(booked.conversations[0]?.detectedTag).toBe("interested");
  });
});

describe("read state (#87)", () => {
  const rows = [
    row({ id: "a2", subject: "Re: Intro", receivedAt: "2026-10-02T10:00:00.000Z" }),
    row({ id: "a1", subject: "Intro", receivedAt: "2026-10-01T10:00:00.000Z" }),
    row({ id: "b1", leadId: "lead-2", fromEmail: "b@example.com", receivedAt: "2026-10-01T09:00:00.000Z" }),
  ];

  it("markRowsRead sets readAt on every member and leaves other rows untouched", () => {
    const at = "2026-10-05T00:00:00.000Z";
    const next = markRowsRead(rows, ["a2", "a1"], at);
    expect(next.find((r) => r.id === "a2")?.readAt).toBe(at);
    expect(next.find((r) => r.id === "a1")?.readAt).toBe(at);
    expect(next.find((r) => r.id === "b1")).toBe(rows[2]);
    const conv = buildInbox(next, NONE).conversations.find((c) => c.memberIds.includes("a2"));
    expect(conv?.unread).toBe(false);
  });

  it("markRowsRead keeps an existing readAt", () => {
    const already = [row({ id: "x", readAt: "2026-01-01T00:00:00.000Z", receivedAt: "2026-01-01T00:00:00.000Z" })];
    expect(markRowsRead(already, ["x"], "2026-10-05T00:00:00.000Z")[0]?.readAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("counts.unread drops by one after markRowsRead on an unread conversation", () => {
    const before = buildInbox(rows, NONE).counts.unread;
    const after = buildInbox(markRowsRead(rows, ["a2", "a1"], "2026-10-05T00:00:00.000Z"), NONE).counts.unread;
    expect(before).toBe(2);
    expect(after).toBe(1);
  });

  it("markLatestUnread clears readAt only on the newest member", () => {
    const read = markRowsRead(rows, ["a2", "a1", "b1"], "2026-10-05T00:00:00.000Z");
    const next = markLatestUnread(read, ["a1", "a2"]);
    expect(next.find((r) => r.id === "a2")?.readAt).toBeNull();
    expect(next.find((r) => r.id === "a1")?.readAt).toBe("2026-10-05T00:00:00.000Z");
    expect(next.find((r) => r.id === "b1")?.readAt).toBe("2026-10-05T00:00:00.000Z");
    const conv = buildInbox(next, NONE).conversations.find((c) => c.memberIds.includes("a2"));
    expect(conv?.unread).toBe(true);
    expect(buildInbox(next, NONE, { view: "unread" }).conversations.map((c) => c.latestId)).toEqual(["a2"]);
  });
});

describe("Awaiting your reply (#85)", () => {
  const LEAD_AT = "2026-10-02T10:00:00.000Z";
  const outbound = (sentAt: string, leadId = "lead-1", campaignId = "camp-1"): InboxContext =>
    awaitingContext({ lastOutboundAt: { [outboundKey(leadId, campaignId)]: sentAt }, lastOutboundByReply: {} });
  const flags = (rows: InboxIndexRow[], ctx: InboxContext = NONE) => buildInboxConversations(rows, ctx)[0]!;

  it("counts a Manual-campaign conversation where the lead wrote last and nobody answered", () => {
    const rows = [row({ id: "m1", agentStatus: null, receivedAt: LEAD_AT })];
    expect(flags(rows).awaiting).toBe(true);
    expect(isAwaitingReply(rows, NONE)).toBe(true);
    expect(buildInbox(rows, NONE).counts.awaiting).toBe(1);
    expect(inboxSignals(buildInboxConversations(rows, NONE))).toEqual({ awaiting: 1, held: 0 });
    // Skipped by the agent (Manual, or taken over by you) still counts.
    expect(flags([row({ id: "s1", agentStatus: "skipped", agentIntent: "manual", receivedAt: LEAD_AT })]).awaiting).toBe(true);
  });

  it("clears once you or the agent sent something after the lead's newest message, and returns when the lead writes again", () => {
    const rows = [row({ id: "m1", receivedAt: LEAD_AT })];
    expect(flags(rows, outbound("2026-10-02T11:00:00.000Z")).awaiting).toBe(false);
    // A send before the lead's message does not answer it.
    expect(flags(rows, outbound("2026-10-02T09:00:00.000Z")).awaiting).toBe(true);
    // A send to the same lead in another campaign does not answer it either.
    expect(flags(rows, outbound("2026-10-02T11:00:00.000Z", "lead-1", "camp-2")).awaiting).toBe(true);
    const again = [row({ id: "m2", subject: "Re: Intro", receivedAt: "2026-10-02T12:00:00.000Z" }), ...rows];
    expect(flags(again, outbound("2026-10-02T11:00:00.000Z")).awaiting).toBe(true);
  });

  it("uses sends anchored to the reply when the reply has no lead", () => {
    const rows = [row({ id: "x1", leadId: null, fromEmail: "who@example.com", receivedAt: LEAD_AT })];
    expect(flags(rows).awaiting).toBe(true);
    const answered = awaitingContext({ lastOutboundAt: {}, lastOutboundByReply: { x1: "2026-10-02T11:00:00.000Z" } });
    expect(flags(rows, answered).awaiting).toBe(false);
  });

  it("does not count replies that need no answer, the agent's work, Needs you or held", () => {
    const not = (partial: Partial<InboxIndexRow>, ctx: InboxContext = NONE) =>
      expect(flags([row({ id: "n1", receivedAt: LEAD_AT, ...partial })], ctx).awaiting).toBe(false);
    not({ tag: "out_of_office", tagSource: "auto" });
    not({ tag: "not_interested", tagSource: "auto" });
    not({ agentStatus: "skipped", agentIntent: "out_of_office" });
    not({ agentStatus: "skipped", agentIntent: "unsubscribe" });
    not({ agentStatus: "pending" });
    not({ agentStatus: "processing" });
    not({ agentStatus: "replied" });
    not({ agentStatus: "human_replied" });
    not({ agentStatus: "held" });
    // An open Needs you card makes it Needs you, never awaiting.
    const card: InboxContext = { requests: [{ id: "q1", replyId: "n1", leadId: "lead-1", campaignId: "camp-1" }] };
    not({}, card);
    not({ agentStatus: "escalated" }, card);
    // The newest reply's own out-of-office tag wins over an older tag a person set.
    const ooo = [
      row({ id: "o2", subject: "Re: Intro", tag: "out_of_office", tagSource: "auto", receivedAt: "2026-10-03T10:00:00.000Z" }),
      row({ id: "o1", tag: "interested", tagSource: "human", receivedAt: LEAD_AT }),
    ];
    expect(flags(ooo).awaiting).toBe(false);
    const held = buildInboxConversations([row({ id: "h1", agentStatus: "held", receivedAt: LEAD_AT })], NONE);
    expect(inboxSignals(held)).toEqual({ awaiting: 0, held: 1 });
  });

  it("counts.awaiting matches the awaiting conversations and respects the campaign and tag filters", () => {
    const rows = [
      row({ id: "a1", leadId: "lead-a", campaignId: "camp-1", receivedAt: "2026-10-05T10:00:00.000Z" }),
      row({ id: "b1", leadId: "lead-b", campaignId: "camp-2", tag: "interested", tagSource: "human", receivedAt: "2026-10-04T10:00:00.000Z" }),
      row({ id: "c1", leadId: "lead-c", campaignId: "camp-2", agentStatus: "replied", receivedAt: "2026-10-03T10:00:00.000Z" }),
      row({ id: "d1", leadId: "lead-d", campaignId: "camp-1", receivedAt: "2026-10-02T10:00:00.000Z" }),
    ];
    const ctx = awaitingContext({ lastOutboundAt: { [outboundKey("lead-d", "camp-1")]: "2026-10-02T11:00:00.000Z" }, lastOutboundByReply: {} });
    const all = buildInbox(rows, ctx);
    expect(all.counts.awaiting).toBe(2);
    expect(all.conversations.filter((c) => c.awaiting).map((c) => c.latestId)).toEqual(["a1", "b1"]);
    expect(buildInbox(rows, ctx, { view: "awaiting" }).conversations.map((c) => c.latestId)).toEqual(["a1", "b1"]);
    expect(buildInbox(rows, ctx, { campaignId: "camp-2" }).counts.awaiting).toBe(1);
    expect(buildInbox(rows, ctx, { tag: "interested" }).counts.awaiting).toBe(1);
    expect(buildInbox(rows, ctx, { campaignId: "camp-1", tag: "interested" }).counts.awaiting).toBe(0);
    expect(inboxSignals(buildInboxConversations(rows, ctx)).awaiting).toBe(2);
  });
});

describe("Needs you has one definition: an open card (#84)", () => {
  const AT = "2026-10-02T10:00:00.000Z";
  const card = (replyId: string): InboxContext => ({
    requests: [{ id: "q1", replyId, leadId: null, campaignId: null }],
  });
  const one = (rows: InboxIndexRow[], ctx: InboxContext = NONE) => buildInbox(rows, ctx).conversations[0]!;

  it("an escalated reply without an open card is not Needs you", () => {
    const c = one([row({ id: "e1", agentStatus: "escalated", receivedAt: AT })]);
    expect(c.needsYou).toBe(false);
    expect(c.requestId).toBeNull();
    expect(buildInbox([row({ id: "e1", agentStatus: "escalated", receivedAt: AT })], NONE).counts.needs_you).toBe(0);
  });

  it("a failed reply with an open card is Needs you, with the card's id", () => {
    const rows = [row({ id: "f1", agentStatus: "failed", receivedAt: AT })];
    const c = one(rows, card("f1"));
    expect(c.needsYou).toBe(true);
    expect(c.requestId).toBe("q1");
    expect(buildInbox(rows, card("f1"), { view: "needs_you" }).conversations).toHaveLength(1);
  });

  it("a card on an older member makes the whole conversation Needs you", () => {
    const rows = [
      row({ id: "n2", subject: "Re: Intro", agentStatus: "escalated", receivedAt: "2026-10-03T10:00:00.000Z" }),
      row({ id: "n1", agentStatus: "escalated", receivedAt: AT }),
    ];
    expect(one(rows, card("n1"))).toMatchObject({ needsYou: true, requestId: "q1", held: false });
  });

  it("a held conversation is flagged held, not Needs you, and counted in signals.held", () => {
    const rows = [row({ id: "h1", agentStatus: "held", receivedAt: AT })];
    const c = one(rows);
    expect(c).toMatchObject({ held: true, needsYou: false, awaiting: false });
    expect(buildInbox(rows, NONE).counts.needs_you).toBe(0);
    expect(inboxSignals(buildInboxConversations(rows, NONE))).toEqual({ awaiting: 0, held: 1 });
  });

  it("held follows the newest open message: an answered newer message clears it", () => {
    const rows = [
      row({ id: "h2", subject: "Re: Intro", agentStatus: "held", receivedAt: "2026-10-03T10:00:00.000Z" }),
      row({ id: "h1", agentStatus: "skipped", receivedAt: AT }),
    ];
    expect(one(rows).held).toBe(true);
    // Released into Needs you after approval: the card wins over held.
    expect(one(rows, card("h2"))).toMatchObject({ held: false, needsYou: true });
  });
});

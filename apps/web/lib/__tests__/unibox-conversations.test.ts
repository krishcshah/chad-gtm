import { describe, expect, it } from "vitest";
import {
  groupUniboxConversations,
  normalizeThreadSubject,
  summarizeUniboxThreads,
  uniboxConversationKey,
} from "../unibox-conversations";

function reply(partial: {
  id: string;
  subject: string;
  receivedAt: string;
  snippet?: string;
  leadId?: string | null;
  campaignId?: string | null;
  fromEmail?: string;
  readAt?: string | null;
}) {
  return {
    id: partial.id,
    leadId: partial.leadId === undefined ? "lead-1" : partial.leadId,
    campaignId: partial.campaignId === undefined ? "camp-1" : partial.campaignId,
    fromEmail: partial.fromEmail ?? "ada@example.com",
    subject: partial.subject,
    snippet: partial.snippet ?? partial.subject,
    receivedAt: partial.receivedAt,
    readAt: partial.readAt === undefined ? null : partial.readAt,
  };
}

describe("normalizeThreadSubject", () => {
  it("strips repeated reply and forward prefixes", () => {
    expect(normalizeThreadSubject("Re: Re: Hello")).toBe("hello");
    expect(normalizeThreadSubject("RE: Hello")).toBe("hello");
    expect(normalizeThreadSubject("Fwd: Hello")).toBe("hello");
    expect(normalizeThreadSubject("Re[2]: Hello")).toBe("hello");
    expect(normalizeThreadSubject("  Re:   Hello   world ")).toBe("hello world");
  });
});

describe("groupUniboxConversations", () => {
  it("collapses each inbound reply in the same thread into one row using the latest snippet", () => {
    const rows = [
      reply({ id: "r5", subject: "Re: Intro", receivedAt: "2026-09-22T05:00:00.000Z", snippet: "fifth" }),
      reply({ id: "r4", subject: "RE: Intro", receivedAt: "2026-09-22T04:00:00.000Z", snippet: "fourth" }),
      reply({ id: "r3", subject: "Re: Re: Intro", receivedAt: "2026-09-22T03:00:00.000Z", snippet: "third" }),
      reply({ id: "r2", subject: "Intro", receivedAt: "2026-09-22T02:00:00.000Z", snippet: "second", readAt: "2026-09-22T02:05:00.000Z" }),
      reply({ id: "r1", subject: "Fwd: Intro", receivedAt: "2026-09-22T01:00:00.000Z", snippet: "first" }),
    ];

    const grouped = groupUniboxConversations(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.latest.id).toBe("r5");
    expect(grouped[0]?.latest.snippet).toBe("fifth");
    expect(grouped[0]?.latest.receivedAt).toBe("2026-09-22T05:00:00.000Z");
    expect(grouped[0]?.memberIds).toEqual(["r5", "r4", "r3", "r2", "r1"]);
    expect(grouped[0]?.unread).toBe(true);
    expect(grouped[0]?.tag).toBeNull();
    expect(grouped[0]?.tagReplyId).toBe("r5");
    expect(uniboxConversationKey(rows[0]!).startsWith("lead-1\u0000camp-1\u0000")).toBe(true);
  });

  it("keeps different subjects, campaigns, and leads apart", () => {
    const rows = [
      reply({ id: "a", subject: "Intro", receivedAt: "2026-09-22T03:00:00.000Z" }),
      reply({ id: "b", subject: "Pricing", receivedAt: "2026-09-22T02:00:00.000Z" }),
      reply({ id: "c", subject: "Intro", receivedAt: "2026-09-22T04:00:00.000Z", campaignId: "camp-2" }),
      reply({ id: "d", subject: "Intro", receivedAt: "2026-09-22T01:00:00.000Z", leadId: "lead-2" }),
    ];
    const grouped = groupUniboxConversations(rows);
    expect(grouped.map((c) => c.latest.id)).toEqual(["c", "a", "b", "d"]);
  });

  it("falls back to fromEmail when leadId is missing", () => {
    const rows = [
      reply({
        id: "e1",
        leadId: null,
        subject: "Re: Hello",
        receivedAt: "2026-09-22T02:00:00.000Z",
        fromEmail: "Ada@Example.com",
        readAt: "2026-09-22T02:01:00.000Z",
      }),
      reply({
        id: "e2",
        leadId: null,
        subject: "Hello",
        receivedAt: "2026-09-22T01:00:00.000Z",
        fromEmail: "ada@example.com",
        readAt: "2026-09-22T01:01:00.000Z",
      }),
    ];
    const grouped = groupUniboxConversations(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.latest.id).toBe("e1");
    expect(grouped[0]?.unread).toBe(false);
    expect(uniboxConversationKey(rows[0]!)).toBe(uniboxConversationKey(rows[1]!));
  });

  it("keeps the newest tag when an older reply in the thread was tagged", () => {
    const rows = [
      reply({ id: "n", subject: "Re: Intro", receivedAt: "2026-09-22T03:00:00.000Z" }),
      { ...reply({ id: "o", subject: "Intro", receivedAt: "2026-09-22T01:00:00.000Z" }), tag: "interested" as const },
    ];
    const grouped = groupUniboxConversations(rows);
    expect(grouped[0]?.tag).toBe("interested");
    expect(grouped[0]?.tagReplyId).toBe("o");
    expect(grouped[0]?.latest.id).toBe("n");
    expect(uniboxConversationKey(rows[0]!)).toBe(uniboxConversationKey(rows[1]!));
    expect(grouped[0]?.threadKey).toBe(uniboxConversationKey(rows[0]!));
  });

  it("returns one list row and the client key for five replies in one lead conversation", () => {
    const rows = [
      reply({ id: "r5", subject: "Re: Intro", receivedAt: "2026-09-22T05:00:00.000Z", snippet: "fifth" }),
      reply({ id: "r4", subject: "RE: Intro", receivedAt: "2026-09-22T04:00:00.000Z", snippet: "fourth" }),
      reply({ id: "r3", subject: "Re: Re: Intro", receivedAt: "2026-09-22T03:00:00.000Z", snippet: "third" }),
      reply({ id: "r2", subject: "Intro", receivedAt: "2026-09-22T02:00:00.000Z", snippet: "second", readAt: "2026-09-22T02:05:00.000Z" }),
      reply({ id: "r1", subject: "Fwd: Intro", receivedAt: "2026-09-22T01:00:00.000Z", snippet: "first" }),
    ].map((row) => ({ ...row, messageId: `<${row.id}@example.com>` }));

    const listed = summarizeUniboxThreads(rows);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe("r5");
    expect(listed[0]?.snippet).toBe("fifth");
    expect(listed[0]?.replyIds).toEqual(["r5", "r4", "r3", "r2", "r1"]);
    expect(listed[0]?.threadKey).toBe(uniboxConversationKey(rows[0]!));
    expect(listed[0]?.threadKey.startsWith("lead-1\u0000camp-1\u0000")).toBe(true);
    expect(listed[0]?.readAt).toBeNull();
    expect(listed[0]?.unread).toBe(true);
  });

  it("keeps two leads as two threadKeys", () => {
    const listed = summarizeUniboxThreads([
      reply({ id: "a", subject: "Re: Intro", receivedAt: "2026-09-22T03:00:00.000Z", leadId: "lead-1" }),
      reply({ id: "b", subject: "Intro", receivedAt: "2026-09-22T02:00:00.000Z", leadId: "lead-2" }),
    ]);
    expect(listed).toHaveLength(2);
    expect(new Set(listed.map((row) => row.threadKey)).size).toBe(2);
  });

  it("uses the RFC822 root when In-Reply-To and References are present", () => {
    const listed = summarizeUniboxThreads([
      {
        ...reply({ id: "root", subject: "Hello", receivedAt: "2026-09-22T00:00:00.000Z" }),
        messageId: "<root@example.com>",
      },
      {
        ...reply({
          id: "child",
          subject: "Different subject",
          receivedAt: "2026-09-22T00:02:00.000Z",
          leadId: "lead-9",
          campaignId: "camp-9",
        }),
        messageId: "<child@example.com>",
        inReplyTo: "<root@example.com>",
        references: "<root@example.com>",
      },
    ]);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.replyIds).toEqual(["child", "root"]);
    expect(listed[0]?.threadKey).toBe(`rfc822:${encodeURIComponent("root@example.com")}`);
  });

  it("does not split a lead conversation on messageId alone", () => {
    const rows = [
      { ...reply({ id: "a", subject: "Intro", receivedAt: "2026-09-22T02:00:00.000Z" }), messageId: "<one@example.com>" },
      { ...reply({ id: "b", subject: "Re: Intro", receivedAt: "2026-09-22T01:00:00.000Z" }), messageId: "<two@example.com>" },
    ];
    const listed = summarizeUniboxThreads(rows);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.threadKey).toBe(uniboxConversationKey(rows[0]!));
  });
});

import { describe, expect, it } from "vitest";
import { buildInbox, inboxCursor, markRowsRead, type InboxContext, type InboxIndexRow } from "../unibox-inbox";

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

function many(n: number): InboxIndexRow[] {
  const base = Date.parse("2026-10-01T00:00:00.000Z");
  return Array.from({ length: n }, (_, i) =>
    row({ id: `r${String(i).padStart(3, "0")}`, leadId: `lead-${i}`, receivedAt: new Date(base - i * 60_000).toISOString() }),
  );
}

describe("buildInbox edge cases (#88)", () => {
  it("treats a malformed cursor as the first page", () => {
    const rows = many(60);
    const first = buildInbox(rows, NONE);
    const bad = buildInbox(rows, NONE, { cursor: "not-a-cursor" });
    expect(bad.conversations.map((c) => c.key)).toEqual(first.conversations.map((c) => c.key));
  });

  it("orders conversations that share a timestamp by id and pages them without loss", () => {
    const at = "2026-10-01T00:00:00.000Z";
    const rows = Array.from({ length: 7 }, (_, i) => row({ id: `s${i}`, leadId: `lead-${i}`, receivedAt: at }));
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = buildInbox(rows, NONE, { pageSize: 3, cursor });
      seen.push(...page.conversations.map((c) => c.latestId));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(["s6", "s5", "s4", "s3", "s2", "s1", "s0"]);
  });

  it("does not add the linked conversation twice when it is already on the page", () => {
    const rows = many(10);
    const page = buildInbox(rows, NONE, { focusReplyId: "r002" });
    expect(page.focusFound).toBe(true);
    expect(page.conversations.filter((c) => c.memberIds.includes("r002"))).toHaveLength(1);
    expect(page.conversations).toHaveLength(10);
  });

  it("drops a conversation from the Unread view once it is read", () => {
    const rows = many(3);
    const before = buildInbox(rows, NONE, { view: "unread" });
    expect(before.conversations).toHaveLength(3);
    const after = buildInbox(markRowsRead(rows, ["r001"], "2026-10-02T00:00:00.000Z"), NONE, { view: "unread" });
    expect(after.conversations.map((c) => c.latestId)).toEqual(["r000", "r002"]);
    expect(after.counts.unread).toBe(2);
    expect(after.counts.all).toBe(3);
  });

  it("builds the cursor from the newest message of the conversation", () => {
    expect(inboxCursor({ latestReceivedAt: "2026-10-01T00:00:00.000Z", latestId: "r1" })).toBe("2026-10-01T00:00:00.000Z|r1");
  });
});

/**
 * #68 / #69: reply sync on shared pool mailboxes. A message that does not
 * thread to one of our emails reaches a customer only when exactly one
 * customer is a candidate; otherwise it waits in the admin triage queue and
 * nobody's Inbox or agent sees it.
 */
import { describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { recordReplyIfNew, recordRoutedReply, NEW_CONTACT_AGENT_SUMMARY } from "../sync-replies";
import type { SenderRow } from "../db-port";
import { routingDb, type World } from "./fixtures/routing-db";

vi.mock("../mailer", () => ({ makeImapClient: vi.fn(), makeTransport: vi.fn(), sendMail: vi.fn() }));

const RECENT = new Date(Date.now() - 5 * 86_400_000).toISOString();
const OLDER = new Date(Date.now() - 10 * 86_400_000).toISOString();

function pool(over: Partial<SenderRow> = {}): SenderRow {
  return {
    id: "P",
    userId: "admin",
    email: "alex@pool.example",
    isSystemPool: true,
    ...over,
  } as unknown as SenderRow;
}

function msg(over: { from: string; subject?: string; body?: string; messageId?: string; inReplyTo?: string }) {
  return {
    envelope: {
      from: [{ address: over.from, name: "" }],
      subject: over.subject ?? "Hello",
      messageId: over.messageId ?? `<${Math.random().toString(36).slice(2)}@mail.example>`,
      inReplyTo: over.inReplyTo,
      date: "2026-11-07T10:00:00.000Z",
    },
    bodyParts: new Map([["1", Buffer.from(over.body ?? "Hi, I saw your note to my colleague. Can we talk?", "utf8")]]),
  };
}

const campaigns: World["campaigns"] = [
  { id: "cA", userId: "A", workspaceId: "wA", stopOnReply: true },
  { id: "cB", userId: "B", workspaceId: "wB", stopOnReply: true },
];

const replies = (writes: ReturnType<typeof routingDb>["writes"]) =>
  writes.filter((w) => w.op === "insert" && w.table === schema.replies).map((w) => w.values);
const unmatched = (writes: ReturnType<typeof routingDb>["writes"]) =>
  writes.filter((w) => w.op === "insert" && w.table === schema.unmatchedInbound).map((w) => w.values);

describe("new contact on a pool mailbox (#68)", () => {
  it("routes to the one customer who emailed that company from this mailbox: reply with no lead, agent skipped", async () => {
    const { db, writes } = routingDb({
      campaigns,
      jobs: [{ id: "j1", campaignId: "cA", senderId: "P", leadId: "lBob", toEmail: "bob@acme.example", status: "sent", sentAt: RECENT }],
    });
    const recorded = await recordReplyIfNew(db, pool(), msg({ from: "dana@acme.example" }));
    expect(recorded).toBe(true);
    const [reply] = replies(writes);
    expect(reply).toMatchObject({
      userId: "A",
      leadId: null,
      campaignId: "cA",
      fromEmail: "dana@acme.example",
      agentStatus: "skipped",
      agentIntent: "new_contact",
      agentSummary: NEW_CONTACT_AGENT_SUMMARY,
    });
    const inbox = writes.find((w) => w.op === "insert" && w.table === schema.uniboxMessages)?.values;
    expect(inbox).toMatchObject({ userId: "A", workspaceId: "wA", leadId: null, direction: "inbound" });
    const activity = writes.find((w) => w.op === "insert" && w.table === schema.activityLogs)?.values;
    expect(activity).toMatchObject({ userId: "A", type: "reply_received", message: "dana@acme.example wrote in to alex@pool.example (new contact)" });
    // No lead, nothing to stop.
    expect(writes.some((w) => w.table === schema.campaignLeads || w.table === schema.emailJobs)).toBe(false);
    expect(unmatched(writes)).toHaveLength(0);
  });

  it("with two customers it creates a triage row with both candidates and no reply", async () => {
    const { db, writes } = routingDb({
      campaigns,
      jobs: [
        { id: "j1", campaignId: "cA", senderId: "P", leadId: "l1", toEmail: "bob@acme.example", status: "sent", sentAt: RECENT },
        { id: "j2", campaignId: "cB", senderId: "P", leadId: "l2", toEmail: "eve@acme.example", status: "sent", sentAt: OLDER },
      ],
    });
    expect(await recordReplyIfNew(db, pool(), msg({ from: "dana@acme.example" }))).toBe(false);
    expect(replies(writes)).toHaveLength(0);
    expect(writes.some((w) => w.table === schema.uniboxMessages)).toBe(false);
    const rows = unmatched(writes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ senderId: "P", fromEmail: "dana@acme.example", reason: "no_match", status: "open" });
    expect([...rows[0].candidateUserIds].sort()).toEqual(["A", "B"]);
  });

  it("a free-mail address is never routed by domain", async () => {
    const { db, writes } = routingDb({
      campaigns,
      jobs: [{ id: "j1", campaignId: "cA", senderId: "P", leadId: "l1", toEmail: "bob@gmail.com", status: "sent", sentAt: RECENT }],
    });
    expect(await recordReplyIfNew(db, pool(), msg({ from: "dana@gmail.com" }))).toBe(false);
    expect(replies(writes)).toHaveLength(0);
    expect(unmatched(writes)[0]).toMatchObject({ reason: "no_match", candidateUserIds: ["A"] });
  });

  it("on a customer's own (non-pool) mailbox it is still ignored", async () => {
    const { db, writes } = routingDb({
      campaigns,
      jobs: [{ id: "j1", campaignId: "cA", senderId: "P", leadId: "l1", toEmail: "bob@acme.example", status: "sent", sentAt: RECENT }],
    });
    expect(await recordReplyIfNew(db, pool({ isSystemPool: false } as any), msg({ from: "dana@acme.example" }))).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it("list mail and auto-replies are not queued", async () => {
    const { db, writes } = routingDb({ campaigns, jobs: [] });
    await recordReplyIfNew(db, pool(), msg({ from: "news@acme.example" }), { "list-id": "<news.acme.example>" });
    await recordReplyIfNew(db, pool(), msg({ from: "dana@acme.example" }), { "auto-submitted": "auto-replied" });
    await recordReplyIfNew(db, pool(), msg({ from: "noreply@acme.example" }));
    expect(writes).toHaveLength(0);
  });

  it("a routed 'remove me' from a new contact still records a suppression", async () => {
    const { db, writes } = routingDb({
      campaigns,
      jobs: [{ id: "j1", campaignId: "cA", senderId: "P", leadId: "l1", toEmail: "bob@acme.example", status: "sent", sentAt: RECENT }],
    });
    await recordReplyIfNew(db, pool(), msg({ from: "dana@acme.example", body: "Please remove me from your list." }));
    const supp = writes.find((w) => w.op === "insert" && w.table === schema.suppressions)?.values;
    expect(supp).toMatchObject({ userId: "A", value: "dana@acme.example", source: "unsubscribe" });
  });

  it("a known lead writing in fresh is attached and stopped, but the agent still does not answer", async () => {
    const { db, writes } = routingDb({
      campaigns,
      leads: [{ id: "lDana", userId: "A", email: "dana@acme.example", workspaceId: "wA", status: "new" }],
      campaignLeads: [{ id: "clDana", campaignId: "cA", leadId: "lDana", status: "queued" }],
      jobs: [{ id: "j1", campaignId: "cA", senderId: "P", leadId: "l1", toEmail: "bob@acme.example", status: "sent", sentAt: RECENT }],
    });
    expect(await recordReplyIfNew(db, pool(), msg({ from: "dana@acme.example" }))).toBe(true);
    expect(replies(writes)[0]).toMatchObject({ userId: "A", leadId: "lDana", agentStatus: "skipped" });
    const stop = writes.find((w) => w.table === schema.campaignLeads && w.set?.status === "replied");
    expect(stop?.where?.params).toContain("clDana");
  });
});

describe("From fallback on a pool mailbox (#69)", () => {
  const bothEmailedBob: World = {
    campaigns,
    leads: [
      { id: "lA", userId: "A", email: "bob@x.example", workspaceId: "wA", status: "contacted" },
      { id: "lB", userId: "B", email: "bob@x.example", workspaceId: "wB", status: "contacted" },
    ],
    jobs: [
      { id: "jA", campaignId: "cA", senderId: "P", leadId: "lA", toEmail: "bob@x.example", status: "sent", messageId: "<a@pool>", sentAt: "2026-06-01T00:00:00.000Z" },
      { id: "jB", campaignId: "cB", senderId: "P", leadId: "lB", toEmail: "bob@x.example", status: "sent", messageId: "<b@pool>", sentAt: "2026-10-01T00:00:00.000Z" },
    ],
  };

  it("two customers emailed bob@x: an unthreaded email creates no reply, one triage row with both candidates", async () => {
    const { db, writes } = routingDb(bothEmailedBob);
    expect(await recordReplyIfNew(db, pool(), msg({ from: "bob@x.example" }))).toBe(false);
    expect(replies(writes)).toHaveLength(0);
    expect(writes.some((w) => w.table === schema.uniboxMessages)).toBe(false);
    const rows = unmatched(writes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: "ambiguous_owner", fromEmail: "bob@x.example" });
    expect([...rows[0].candidateUserIds].sort()).toEqual(["A", "B"]);
  });

  it("a threaded reply (In-Reply-To = B's message) still goes to B", async () => {
    const { db, writes } = routingDb(bothEmailedBob);
    expect(await recordReplyIfNew(db, pool(), msg({ from: "bob@x.example", inReplyTo: "<b@pool>" }))).toBe(true);
    expect(replies(writes)[0]).toMatchObject({ userId: "B", leadId: "lB", campaignId: "cB" });
    expect(unmatched(writes)).toHaveLength(0);
  });

  it("when only A emailed bob@x, the From fallback still attributes it to A", async () => {
    const { db, writes } = routingDb({ ...bothEmailedBob, jobs: bothEmailedBob.jobs!.slice(0, 1) });
    expect(await recordReplyIfNew(db, pool(), msg({ from: "bob@x.example" }))).toBe(true);
    expect(replies(writes)[0]).toMatchObject({ userId: "A", leadId: "lA", campaignId: "cA" });
    expect(unmatched(writes)).toHaveLength(0);
  });
});

describe("recordRoutedReply (admin assignment)", () => {
  it("records a reply for the assigned customer and returns its id", async () => {
    const { db, writes } = routingDb({});
    const out = await recordRoutedReply(db, {
      sender: pool(),
      ownerId: "A",
      workspaceId: "wA",
      campaignId: null,
      lead: null,
      from: { name: "Dana", email: "Dana@Acme.example" },
      subject: "Hi",
      bodies: { bodyText: "Hello", bodyHtml: "", snippet: "Hello" },
      messageId: "<m@x>",
      receivedAt: "2026-11-07T10:00:00.000Z",
      routed: "admin",
    });
    expect(out?.replyId).toBeTruthy();
    expect(replies(writes)[0]).toMatchObject({ id: out!.replyId, userId: "A", leadId: null, fromEmail: "dana@acme.example", agentStatus: "skipped" });
  });

  it("refuses a message with no lead that was not routed", async () => {
    const { db, writes } = routingDb({});
    const out = await recordRoutedReply(db, {
      sender: pool(),
      ownerId: "A",
      workspaceId: "wA",
      campaignId: null,
      lead: null,
      from: { name: "", email: "dana@acme.example" },
      subject: "Hi",
      bodies: { bodyText: "Hello", bodyHtml: "", snippet: "Hello" },
      messageId: null,
      receivedAt: "2026-11-07T10:00:00.000Z",
    });
    expect(out).toBeNull();
    expect(writes).toHaveLength(0);
  });
});

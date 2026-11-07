/**
 * #70: a shared pool mailbox records replies for every customer it sends for.
 * syncSenderReplies splits its count by the customer each reply was filed
 * under, so "Check for new replies" tells a user only about their own.
 */
import { describe, expect, it, vi } from "vitest";
import type { SenderRow } from "../db-port";
import { routingDb, type World } from "./fixtures/routing-db";

const imap = vi.hoisted(() => ({ messages: [] as any[] }));

vi.mock("../mailer", () => ({
  makeImapClient: vi.fn(() => ({
    usable: true,
    connect: vi.fn(async () => {}),
    mailboxOpen: vi.fn(async () => {}),
    search: vi.fn(async () => imap.messages.map((_, i) => i + 1)),
    fetch: async function* () {
      for (const m of imap.messages) yield m;
    },
    logout: vi.fn(async () => {}),
  })),
  makeTransport: vi.fn(),
  sendMail: vi.fn(),
}));

import { syncSenderReplies } from "../sync-replies";

const pool = {
  id: "P",
  userId: "admin",
  email: "alex@pool.example",
  isSystemPool: true,
  imapHost: "imap.pool.example",
  imapPasswordEnc: "enc",
  lastSyncAt: null,
} as unknown as SenderRow;

function msg(from: string, inReplyTo: string, messageId: string) {
  return {
    envelope: {
      from: [{ address: from, name: "" }],
      subject: "Re: hello",
      messageId,
      inReplyTo,
      date: "2026-11-07T10:00:00.000Z",
    },
    bodyParts: new Map([["1", Buffer.from("Sounds good, tell me more.", "utf8")]]),
  };
}

const world: World = {
  campaigns: [
    { id: "cA", userId: "A", workspaceId: "wA", stopOnReply: true },
    { id: "cB", userId: "B", workspaceId: "wB", stopOnReply: true },
  ],
  leads: [
    { id: "lA", userId: "A", email: "ann@x.example", workspaceId: "wA", status: "contacted" },
    { id: "lB", userId: "B", email: "bob@y.example", workspaceId: "wB", status: "contacted" },
    { id: "lB2", userId: "B", email: "cat@z.example", workspaceId: "wB", status: "contacted" },
  ],
  jobs: [
    { id: "jA", campaignId: "cA", senderId: "P", leadId: "lA", toEmail: "ann@x.example", status: "sent", messageId: "<a@pool>", sentAt: "2026-11-01T00:00:00.000Z" },
    { id: "jB", campaignId: "cB", senderId: "P", leadId: "lB", toEmail: "bob@y.example", status: "sent", messageId: "<b@pool>", sentAt: "2026-11-01T00:00:00.000Z" },
    { id: "jB2", campaignId: "cB", senderId: "P", leadId: "lB2", toEmail: "cat@z.example", status: "sent", messageId: "<c@pool>", sentAt: "2026-11-01T00:00:00.000Z" },
  ],
};

describe("syncSenderReplies foundByOwner (#70)", () => {
  it("splits a pool mailbox's new replies by the customer they were filed under", async () => {
    imap.messages = [
      msg("ann@x.example", "<a@pool>", "<r1@x.example>"),
      msg("bob@y.example", "<b@pool>", "<r2@y.example>"),
      msg("cat@z.example", "<c@pool>", "<r3@z.example>"),
    ];
    const { db } = routingDb(world);
    const r = await syncSenderReplies(db, pool);
    expect(r.error).toBeUndefined();
    expect(r.found).toBe(3);
    expect(r.foundByOwner).toEqual({ A: 1, B: 2 });
    // The mailbox's owner (the platform admin) is never credited with a customer's reply.
    expect(r.foundByOwner.admin).toBeUndefined();
  });

  it("a mailbox with no inbox settings reports nothing for anyone", async () => {
    const { db } = routingDb(world);
    const r = await syncSenderReplies(db, { ...pool, imapHost: "" } as SenderRow);
    expect(r).toEqual({ found: 0, foundByOwner: {} });
  });
});

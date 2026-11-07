/**
 * #39: one funnel per person. A "remove me" reply makes every lead row of the
 * person (for that owner) Unsubscribed, not Replied; a plain "not interested"
 * reply is blocklisted with its own source ('not_interested', labelled
 * "Replied: not interested"), not 'manual' ("Added by you").
 */
import { describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { recordReplyIfNew } from "../sync-replies";
import type { SenderRow } from "../db-port";
import { routingDb } from "./fixtures/routing-db";

vi.mock("../mailer", () => ({ makeImapClient: vi.fn(), makeTransport: vi.fn(), sendMail: vi.fn() }));

const RECENT = new Date(Date.now() - 5 * 86_400_000).toISOString();

const own = { id: "S", userId: "A", email: "alex@acme-sales.example", isSystemPool: false } as unknown as SenderRow;

function msg(body: string) {
  return {
    envelope: {
      from: [{ address: "dana@acme.example", name: "" }],
      subject: "Re: Hello",
      messageId: `<${Math.random().toString(36).slice(2)}@mail.example>`,
      date: "2026-11-07T10:00:00.000Z",
    },
    bodyParts: new Map([["1", Buffer.from(body, "utf8")]]),
  };
}

function world() {
  return routingDb({
    campaigns: [{ id: "cA", userId: "A", workspaceId: "wA", stopOnReply: true }],
    leads: [{ id: "lDana", userId: "A", email: "dana@acme.example", workspaceId: "wA", status: "contacted" }],
    campaignLeads: [{ id: "clDana", campaignId: "cA", leadId: "lDana", status: "sent" }],
    jobs: [
      { id: "j1", campaignId: "cA", senderId: "S", leadId: "lDana", toEmail: "dana@acme.example", status: "sent", sentAt: RECENT },
    ],
  });
}

const leadStatusWrites = (writes: ReturnType<typeof routingDb>["writes"]) =>
  writes.filter((w) => w.op === "update" && w.table === schema.leads).map((w) => w.set?.status);

describe("reply opt-outs and the lead funnel", () => {
  it("'remove me' suppresses globally and marks the person's lead rows unsubscribed", async () => {
    const { db, writes } = world();
    expect(await recordReplyIfNew(db, own, msg("Please remove me from your list."))).toBe(true);
    const supp = writes.find((w) => w.op === "insert" && w.table === schema.suppressions)?.values;
    expect(supp).toMatchObject({ userId: "A", value: "dana@acme.example", source: "unsubscribe" });
    const statuses = leadStatusWrites(writes);
    expect(statuses).toContain("unsubscribed");
    // Unsubscribed is written last, so it wins over Replied.
    expect(statuses[statuses.length - 1]).toBe("unsubscribed");
  });

  it("'not interested' is blocklisted as not_interested (never 'manual') and does not unsubscribe the lead", async () => {
    const { db, writes } = world();
    expect(await recordReplyIfNew(db, own, msg("Thanks, but we're not interested."))).toBe(true);
    const supp = writes.find((w) => w.op === "insert" && w.table === schema.suppressions)?.values;
    expect(supp).toMatchObject({ userId: "A", source: "not_interested", reason: "Replied not interested" });
    expect(leadStatusWrites(writes)).not.toContain("unsubscribed");
  });
});

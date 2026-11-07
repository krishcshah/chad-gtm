/**
 * #69 regression: an unthreaded reply from an address two customers emailed
 * from the same pool mailbox goes to admin triage unrecorded, but the opt-out
 * and stop guards still apply right away (fail closed): a "remove me" or spam
 * complaint is suppressed globally, and both customers' open sends to the
 * person stop.
 */
import { describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { recordReplyIfNew } from "../sync-replies";
import { UNASSIGNED_REPLY_STOP_REASON } from "../lead-outcomes";
import type { SenderRow } from "../db-port";
import { routingDb, type World } from "./fixtures/routing-db";

vi.mock("../mailer", () => ({ makeImapClient: vi.fn(), makeTransport: vi.fn(), sendMail: vi.fn() }));

function pool(over: Partial<SenderRow> = {}): SenderRow {
  return { id: "P", userId: "admin", email: "alex@pool.example", isSystemPool: true, ...over } as unknown as SenderRow;
}

function msg(body: string, subject = "Re: quick question") {
  return {
    envelope: {
      from: [{ address: "bob@x.example", name: "Bob" }],
      subject,
      messageId: `<${Math.random().toString(36).slice(2)}@mail.example>`,
      date: "2026-11-07T10:00:00.000Z",
    },
    bodyParts: new Map([["1", Buffer.from(body, "utf8")]]),
  };
}

/** A and B both emailed bob@x from pool mailbox P; B has a second campaign with Stop on reply off. */
function world(): World {
  return {
    campaigns: [
      { id: "cA", userId: "A", workspaceId: "wA", stopOnReply: true },
      { id: "cB", userId: "B", workspaceId: "wB", stopOnReply: true },
      { id: "cB2", userId: "B", workspaceId: "wB", stopOnReply: false },
    ],
    leads: [
      { id: "lA", userId: "A", email: "bob@x.example", workspaceId: "wA", status: "contacted" },
      { id: "lB", userId: "B", email: "bob@x.example", workspaceId: "wB", status: "contacted" },
    ],
    campaignLeads: [
      { id: "clA", campaignId: "cA", leadId: "lA", status: "queued" },
      { id: "clB", campaignId: "cB", leadId: "lB", status: "scheduled" },
      { id: "clB2", campaignId: "cB2", leadId: "lB", status: "queued" },
    ],
    jobs: [
      { id: "jA", campaignId: "cA", senderId: "P", leadId: "lA", toEmail: "bob@x.example", status: "sent", messageId: "<a@pool>", sentAt: "2026-06-01T00:00:00.000Z" },
      { id: "jB", campaignId: "cB", senderId: "P", leadId: "lB", toEmail: "bob@x.example", status: "sent", messageId: "<b@pool>", sentAt: "2026-10-01T00:00:00.000Z" },
    ],
  };
}

type Writes = ReturnType<typeof routingDb>["writes"];
const inserts = (writes: Writes, table: unknown) =>
  writes.filter((w) => w.op === "insert" && w.table === table).map((w) => w.values);
const cancelledRows = (writes: Writes) =>
  writes
    .filter((w) => w.op === "update" && w.table === schema.campaignLeads && w.set?.status === "cancelled")
    .map((w) => ({ reason: w.set.lastError, params: w.where?.params ?? [] }));
const cancelledIds = (writes: Writes) =>
  cancelledRows(writes).flatMap((r) => r.params.filter((p) => typeof p === "string" && p.startsWith("cl")));

describe("unthreaded reply with several possible owners (#69)", () => {
  it("'remove me' writes the global unsubscribe for every candidate and stops all their campaigns", async () => {
    const { db, writes } = routingDb(world());
    expect(await recordReplyIfNew(db, pool(), msg("Please remove me from your list."))).toBe(false);

    expect(inserts(writes, schema.replies)).toHaveLength(0);
    const supp = inserts(writes, schema.suppressions);
    expect(supp.map((s) => s.userId).sort()).toEqual(["A", "B"]);
    for (const s of supp) expect(s).toMatchObject({ value: "bob@x.example", source: "unsubscribe" });
    expect(supp.find((s) => s.userId === "A")).toMatchObject({ workspaceId: "wA" });

    // An opt-out stops every campaign, Stop on reply or not.
    expect(cancelledIds(writes).sort()).toEqual(["clA", "clB", "clB2"]);
    for (const r of cancelledRows(writes)) expect(r.reason).toBe("opted-out");
    const jobParams = writes
      .filter((w) => w.op === "update" && w.table === schema.emailJobs && w.set?.status === "cancelled")
      .flatMap((w) => w.where?.params ?? []);
    expect(jobParams).toEqual(expect.arrayContaining(["clA", "clB", "clB2"]));

    // Nobody's lead is marked replied before an admin assigns the message.
    expect(writes.some((w) => w.op === "update" && w.table === schema.leads)).toBe(false);
    const triage = inserts(writes, schema.unmatchedInbound);
    expect(triage).toHaveLength(1);
    expect(triage[0]).toMatchObject({ reason: "ambiguous_owner" });
  });

  it("a spam complaint is suppressed as a complaint", async () => {
    const { db, writes } = routingDb(world());
    await recordReplyIfNew(db, pool(), msg("This is spam. I have marked it as spam."));
    const supp = inserts(writes, schema.suppressions);
    expect(supp).toHaveLength(2);
    for (const s of supp) expect(s).toMatchObject({ source: "complaint", value: "bob@x.example" });
  });

  it("a plain reply writes no suppression and stops only campaigns with Stop on reply on", async () => {
    const { db, writes } = routingDb(world());
    await recordReplyIfNew(db, pool(), msg("Sure, tell me more about pricing."));
    expect(inserts(writes, schema.suppressions)).toHaveLength(0);
    expect(cancelledIds(writes).sort()).toEqual(["clA", "clB"]);
    for (const r of cancelledRows(writes)) expect(r.reason).toBe(UNASSIGNED_REPLY_STOP_REASON);
    expect(inserts(writes, schema.unmatchedInbound)).toHaveLength(1);
  });

  it("'not interested' stops every candidate's campaigns but writes no per-customer suppression", async () => {
    const { db, writes } = routingDb(world());
    await recordReplyIfNew(db, pool(), msg("Not interested, thanks."));
    expect(inserts(writes, schema.suppressions)).toHaveLength(0);
    expect(cancelledIds(writes).sort()).toEqual(["clA", "clB", "clB2"]);
  });

  it("an automatic out-of-office reply stops nothing", async () => {
    const { db, writes } = routingDb(world());
    await recordReplyIfNew(db, pool(), msg("I am out of the office until Monday."), { "auto-submitted": "auto-replied" });
    expect(inserts(writes, schema.suppressions)).toHaveLength(0);
    expect(cancelledRows(writes)).toHaveLength(0);
  });

  it("on a non-pool mailbox the guards apply but nothing is queued for triage", async () => {
    const { db, writes } = routingDb(world());
    await recordReplyIfNew(db, pool({ isSystemPool: false } as any), msg("Please remove me."));
    expect(inserts(writes, schema.suppressions)).toHaveLength(2);
    expect(cancelledIds(writes).sort()).toEqual(["clA", "clB", "clB2"]);
    expect(inserts(writes, schema.unmatchedInbound)).toHaveLength(0);
  });

  it("when a suppression write fails it still stops the campaigns and queues triage, then reports the error", async () => {
    const { db, writes } = routingDb(world());
    const insert = db.insert;
    db.insert = (table: unknown) => {
      if (table === schema.suppressions) throw new Error("db down");
      return insert(table);
    };
    await expect(recordReplyIfNew(db, pool(), msg("Please remove me."))).rejects.toThrow("db down");
    expect(cancelledIds(writes).sort()).toEqual(["clA", "clB", "clB2"]);
    expect(inserts(writes, schema.unmatchedInbound)).toHaveLength(1);
  });
});

/**
 * #30 / #36: a reply, bounce or opt-out belongs to the person (owner + email),
 * not to the one lead row it threaded to, and each campaign's "Stop on reply"
 * decides whether that campaign keeps sending.
 */
import { describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import {
  REPLIED_LEAD_STATUSES,
  isRepliedLeadStatus,
  planReplyStop,
  setLeadStatusForEmail,
  stopAllCampaignsForEmail,
  stopLeadAfterReply,
  type ReplyStopRow,
} from "../lead-outcomes";
import { recordHardBounce } from "../bounces";
import { routingDb } from "./fixtures/routing-db";

const NOW = "2026-11-07T12:00:00.000Z";
const row = (campaignLeadId: string, campaignId: string, status: string, stopOnReply: boolean): ReplyStopRow => ({
  campaignLeadId,
  campaignId,
  status,
  stopOnReply,
});

describe("planReplyStop", () => {
  it("a reply in A (stopOnReply) cancels B's queued row (stopOnReply) and leaves C's (stopOnReply off)", () => {
    const plan = planReplyStop(
      [row("a1", "A", "queued", true), row("b1", "B", "queued", true), row("c1", "C", "queued", false)],
      { repliedCampaignId: "A", optOut: false },
    );
    expect(plan.markReplied).toEqual(["a1"]);
    expect(plan.cancel).toEqual(["b1"]);
  });

  it("a reply in A with stopOnReply off leaves A's queued row running and marks A's sent row replied", () => {
    const plan = planReplyStop(
      [row("a-queued", "A", "queued", false), row("a-scheduled", "A", "scheduled", false), row("a-sent", "A", "sent", false)],
      { repliedCampaignId: "A", optOut: false },
    );
    expect(plan.markReplied).toEqual(["a-sent"]);
    expect(plan.cancel).toEqual([]);
  });

  it("a reply in A cancels B's queued row only when B.stopOnReply is on", () => {
    const on = planReplyStop([row("b1", "B", "scheduled", true)], { repliedCampaignId: "A", optOut: false });
    const off = planReplyStop([row("b1", "B", "scheduled", false)], { repliedCampaignId: "A", optOut: false });
    expect(on.cancel).toEqual(["b1"]);
    expect(off.cancel).toEqual([]);
    expect(off.markReplied).toEqual([]);
  });

  it("an opt-out stops every queued/scheduled row in every campaign, whatever stopOnReply says", () => {
    const plan = planReplyStop(
      [
        row("a1", "A", "queued", false),
        row("a2", "A", "sent", false),
        row("b1", "B", "scheduled", false),
        row("c1", "C", "queued", true),
      ],
      { repliedCampaignId: "A", optOut: true },
    );
    expect(plan.markReplied.sort()).toEqual(["a1", "a2"]);
    expect(plan.cancel.sort()).toEqual(["b1", "c1"]);
  });

  it("never touches replied, failed or cancelled rows", () => {
    const plan = planReplyStop(
      [
        row("a1", "A", "replied", true),
        row("a2", "A", "failed", true),
        row("b1", "B", "cancelled", true),
        row("b2", "B", "replied", true),
        row("b3", "B", "sent", true),
      ],
      { repliedCampaignId: "A", optOut: true },
    );
    expect(plan).toEqual({ markReplied: [], cancel: [] });
  });

  it("with no replied campaign (an opt-out from elsewhere) every open row is cancelled", () => {
    const plan = planReplyStop([row("a1", "A", "queued", false), row("b1", "B", "sent", true)], {
      repliedCampaignId: null,
      optOut: true,
    });
    expect(plan).toEqual({ markReplied: [], cancel: ["a1"] });
  });
});

describe("REPLIED_LEAD_STATUSES", () => {
  it("covers a reply and every later outcome", () => {
    expect([...REPLIED_LEAD_STATUSES]).toEqual(["replied", "interested", "meeting_booked", "won", "lost"]);
    expect(isRepliedLeadStatus("interested")).toBe(true);
    expect(isRepliedLeadStatus("contacted")).toBe(false);
    expect(isRepliedLeadStatus(null)).toBe(false);
  });
});

function world() {
  return {
    leads: [
      { id: "lA", userId: "u1", email: "bob@acme.example", status: "contacted" },
      { id: "lB", userId: "u1", email: "Bob@Acme.example", status: "interested" },
      { id: "lC", userId: "u1", email: "bob@acme.example", status: "new" },
      { id: "lX", userId: "u2", email: "bob@acme.example", status: "new" },
    ],
    campaigns: [
      { id: "A", userId: "u1", stopOnReply: true },
      { id: "B", userId: "u1", stopOnReply: true },
      { id: "C", userId: "u1", stopOnReply: false },
      { id: "X", userId: "u2", stopOnReply: true },
    ],
    campaignLeads: [
      { id: "clA", campaignId: "A", leadId: "lA", status: "scheduled" },
      { id: "clB", campaignId: "B", leadId: "lB", status: "queued" },
      { id: "clC", campaignId: "C", leadId: "lC", status: "queued" },
      { id: "clX", campaignId: "X", leadId: "lX", status: "queued" },
    ],
  };
}

describe("stopLeadAfterReply", () => {
  it("marks the owner's rows replied only from new/contacted and stops campaigns per stopOnReply", async () => {
    const { db, writes } = routingDb(world());
    const plan = await stopLeadAfterReply(db, {
      ownerId: "u1",
      email: "bob@acme.example",
      leadId: "lA",
      campaignId: "A",
      optOut: false,
      nowIso: NOW,
    });
    expect(plan).toEqual({ markReplied: ["clA"], cancel: ["clB"] });

    const leadUpdate = writes.find((w) => w.op === "update" && w.table === schema.leads);
    expect(leadUpdate?.set).toMatchObject({ status: "replied" });
    // Every lead row of this owner for that address, never the other customer's.
    expect(leadUpdate?.where?.params).toEqual(expect.arrayContaining(["lA", "lB", "lC", "new", "contacted"]));
    expect(leadUpdate?.where?.params).not.toContain("lX");
    // An 'interested' row keeps its status: the update is limited to new/contacted.
    expect(leadUpdate?.where?.params).not.toContain("interested");

    const replied = writes.find((w) => w.table === schema.campaignLeads && w.set?.status === "replied");
    expect(replied?.where?.params).toEqual(expect.arrayContaining(["clA"]));
    const cancelled = writes.find((w) => w.table === schema.campaignLeads && w.set?.status === "cancelled");
    expect(cancelled?.set.lastError).toBe("replied-to-another-campaign");
    expect(cancelled?.where?.params).toEqual(expect.arrayContaining(["clB"]));
    expect(cancelled?.where?.params).not.toContain("clC");

    // Jobs of both sets are cancelled.
    const jobs = writes.find((w) => w.table === schema.emailJobs);
    expect(jobs?.set).toMatchObject({ status: "cancelled", lastError: "lead-replied" });
    expect(jobs?.where?.params).toEqual(expect.arrayContaining(["clA", "clB", "pending", "retry", "processing"]));
    expect(jobs?.where?.params).not.toContain("clC");
    expect(jobs?.where?.params).not.toContain("clX");
  });

  it("an opt-out stops every campaign of the owner, labelled opted-out", async () => {
    const { db, writes } = routingDb(world());
    const plan = await stopLeadAfterReply(db, {
      ownerId: "u1",
      email: "bob@acme.example",
      leadId: "lA",
      campaignId: "A",
      optOut: true,
      nowIso: NOW,
    });
    expect(plan.markReplied).toEqual(["clA"]);
    expect(plan.cancel.sort()).toEqual(["clB", "clC"]);
    const cancelled = writes.find((w) => w.table === schema.campaignLeads && w.set?.status === "cancelled");
    expect(cancelled?.set.lastError).toBe("opted-out");
  });

  it("still stops the threaded lead when its address lookup finds nothing", async () => {
    const { db, writes } = routingDb({
      leads: [],
      campaigns: [{ id: "A", userId: "u1", stopOnReply: true }],
      campaignLeads: [{ id: "clA", campaignId: "A", leadId: "lA", status: "queued" }],
    });
    const plan = await stopLeadAfterReply(db, {
      ownerId: "u1",
      email: "bob@acme.example",
      leadId: "lA",
      campaignId: "A",
      optOut: false,
      nowIso: NOW,
    });
    expect(plan.markReplied).toEqual(["clA"]);
    expect(writes.find((w) => w.table === schema.leads)?.where?.params).toContain("lA");
  });
});

describe("stopAllCampaignsForEmail", () => {
  it("cancels every open row of the owner's person with the reason", async () => {
    const { db, writes } = routingDb(world());
    const plan = await stopAllCampaignsForEmail(db, { ownerId: "u1", email: "BOB@acme.example", reason: "unsubscribed", nowIso: NOW });
    expect(plan.cancel.sort()).toEqual(["clA", "clB", "clC"]);
    const jobs = writes.find((w) => w.table === schema.emailJobs);
    expect(jobs?.set).toMatchObject({ status: "cancelled", lastError: "unsubscribed" });
  });
});

describe("setLeadStatusForEmail", () => {
  it("never overwrites bounced/unsubscribed with a softer status", async () => {
    const { db, writes } = routingDb({});
    await setLeadStatusForEmail(db, { ownerId: "u1", email: "bob@acme.example", status: "interested", nowIso: NOW });
    const w = writes[0];
    expect(w.set).toMatchObject({ status: "interested" });
    expect(w.where?.sql).toContain("not in");
    expect(w.where?.params).toEqual(expect.arrayContaining(["bounced", "unsubscribed"]));
  });

  it("a bounce may overwrite any status", async () => {
    const { db, writes } = routingDb({});
    await setLeadStatusForEmail(db, { ownerId: "u1", email: "bob@acme.example", status: "bounced", nowIso: NOW });
    expect(writes[0].where?.sql).not.toContain("not in");
  });

  it("'unsubscribed' updates every one of the owner's rows with that email (any case), in one write", async () => {
    const { db, writes } = routingDb({});
    await setLeadStatusForEmail(db, { ownerId: "u1", email: "Bob@Acme.example", status: "unsubscribed", nowIso: NOW });
    expect(writes).toHaveLength(1);
    expect(writes[0].set).toMatchObject({ status: "unsubscribed" });
    expect(writes[0].where?.sql).toContain("lower(");
    expect(writes[0].where?.params).toEqual(expect.arrayContaining(["u1", "bob@acme.example"]));
    // Not limited to one lead row, and may overwrite a Replied/Won row.
    expect(writes[0].where?.sql).not.toContain("not in");
  });

  it("'won' never overwrites a bounced row", async () => {
    const { db, writes } = routingDb({});
    await setLeadStatusForEmail(db, { ownerId: "u1", email: "bob@acme.example", status: "won", nowIso: NOW });
    expect(writes[0].set).toMatchObject({ status: "won" });
    expect(writes[0].where?.sql).toContain("not in");
    expect(writes[0].where?.params).toEqual(expect.arrayContaining(["bounced"]));
  });
});

describe("recordHardBounce marks the person's other rows", () => {
  it("other rows with the same address become bounced, their open steps fail and jobs cancel", async () => {
    const { db, writes } = routingDb(world());
    await recordHardBounce(db, {
      email: "bob@acme.example",
      leadId: "lA",
      jobId: "j1",
      campaignId: "A",
      ownerUserId: "u1",
      status: "5.1.1",
      via: "dsn",
    });
    const others = writes.filter((w) => w.where?.params.includes("lB") && w.where?.params.includes("lC"));
    const leadRows = others.find((w) => w.table === schema.leads);
    expect(leadRows?.set).toMatchObject({ status: "bounced" });
    expect(leadRows?.where?.params).not.toContain("lX");
    const cls = others.find((w) => w.table === schema.campaignLeads);
    expect(cls?.set).toMatchObject({ status: "failed" });
    expect(cls?.where?.params).toEqual(expect.arrayContaining(["queued", "scheduled"]));
    const jobs = others.find((w) => w.table === schema.emailJobs);
    expect(jobs?.set).toMatchObject({ status: "cancelled", lastError: "lead-bounced" });
    // The suppression is still written (global guard).
    expect(writes.some((w) => w.table === schema.suppressions && w.values?.source === "bounce")).toBe(true);
  });
});

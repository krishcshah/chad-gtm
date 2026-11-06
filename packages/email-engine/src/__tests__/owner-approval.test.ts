import { afterEach, describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import { schedulerTick } from "../scheduler";
import { processJob } from "../processor";
import { isOwnerApproved, loadUnapprovedOwners, OWNER_NOT_APPROVED_NOTE } from "../owner-approval";

/** Drizzle-shaped fake: selects resolve in order; records tables and writes. */
function fakeDb(selectResults: any[][]) {
  const selects: unknown[] = [];
  const deletes: unknown[] = [];
  const updates: unknown[] = [];
  const chain = (result: any[]) => {
    const c: any = {
      from: (t: unknown) => {
        selects.push(t);
        return c;
      },
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      groupBy: () => c,
      limit: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const writeChain = (log: unknown[], table: unknown, result: any[] = []) => {
    log.push(table);
    const c: any = {
      set: () => c,
      values: () => c,
      where: () => c,
      returning: () => c,
      onConflictDoNothing: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(selectResults.shift() ?? []),
    update: (t: unknown) => writeChain(updates, t),
    insert: (t: unknown) => writeChain(updates, t),
    delete: (t: unknown) => writeChain(deletes, t, [{ id: "job-1" }]),
  };
  return { db, selects, deletes, updates };
}

function campaign(id: string, userId: string) {
  return {
    id,
    userId,
    name: `Campaign ${id}`,
    status: "running",
    deletedAt: null,
    senderCapUntil: null,
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    // Outside the window at 12:00 UTC, so an approved campaign stops before any sending work.
    sendingWindowStart: "00:00",
    sendingWindowEnd: "00:01",
    dailyLimit: 50,
  } as any;
}

const env = process.env as Record<string, string | undefined>;
const savedFlag = env.SIGNUP_APPROVAL_REQUIRED;
afterEach(() => {
  if (savedFlag === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = savedFlag;
});

const NOON = new Date("2026-11-06T12:00:00.000Z");

describe("owner approval helpers", () => {
  it("approved = admin role or approved_at set", () => {
    expect(isOwnerApproved({ role: "admin", approvedAt: null })).toBe(true);
    expect(isOwnerApproved({ role: "user", approvedAt: new Date() })).toBe(true);
    expect(isOwnerApproved({ role: "user", approvedAt: null })).toBe(false);
    expect(isOwnerApproved(undefined)).toBe(false);
  });

  it("treats unknown users as unapproved and skips the query when approval is off", async () => {
    const { db, selects } = fakeDb([[{ id: "u-ok", role: "user", approvedAt: new Date() }]]);
    expect([...(await loadUnapprovedOwners(db, ["u-ok", "u-missing"], {}))]).toEqual(["u-missing"]);
    expect(selects).toEqual([schema.users]);

    const off = fakeDb([]);
    expect((await loadUnapprovedOwners(off.db, ["u1"], { SIGNUP_APPROVAL_REQUIRED: "false" })).size).toBe(0);
    expect(off.selects).toEqual([]);
  });
});

describe("schedulerTick skips campaigns whose owner is not approved", () => {
  it("notes owner-not-approved for a revoked owner and keeps approved owners", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    const { db } = fakeDb([
      [], // startDueCampaigns: nothing scheduled
      [campaign("a", "u-revoked"), campaign("b", "u-ok")],
      [{ id: "u-ok", role: "user", approvedAt: new Date("2026-01-01T00:00:00Z") }, { id: "u-revoked", role: "user", approvedAt: null }],
    ]);
    const r = await schedulerTick(db, NOON);
    expect(r.skipped).toContain(`Campaign a: ${OWNER_NOT_APPROVED_NOTE}`);
    expect(r.skipped).toContain("Campaign b: outside window");
    expect(r.skipped.some((s) => s.startsWith("Campaign b: owner"))).toBe(false);
    expect(r.enqueued).toBe(0);
  });

  it("does not check approval when SIGNUP_APPROVAL_REQUIRED is false", async () => {
    env.SIGNUP_APPROVAL_REQUIRED = "false";
    const { db, selects } = fakeDb([[], [campaign("a", "u-revoked")]]);
    const r = await schedulerTick(db, NOON);
    expect(r.skipped).toEqual(["Campaign a: outside window"]);
    expect(selects).not.toContain(schema.users);
  });
});

describe("processJob hands back jobs of unapproved owners", () => {
  it("releases the job to the scheduler instead of sending", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    const { db, deletes, selects } = fakeDb([
      [{ id: "s1", status: "active" }], // sender
      [{ id: "c1", userId: "u-revoked", status: "running" }], // campaign
      [{ id: "u-revoked", role: "user", approvedAt: null }], // owner
    ]);
    const outcome = await processJob(db, {
      id: "job-1",
      senderId: "s1",
      campaignId: "c1",
      campaignLeadId: "cl1",
      leadId: "l1",
      toEmail: "x@acme.com",
      status: "processing",
    } as any);
    expect(outcome).toBe("skipped");
    expect(deletes).toEqual([schema.emailJobs]);
    expect(selects).not.toContain(schema.leads);
  });
});

/**
 * #17: the scheduler stores why a running campaign is not sending
 * (campaigns.send_block_reason), only when the reason changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  recordSendBlock,
  scheduleCampaign,
  schedulerTick,
  SEND_BLOCK_REASONS,
  sendBlockFor,
} from "../scheduler";

type Write = { op: string; table: unknown; set?: any };

/** Selects resolve in order (an Error entry rejects); writes are recorded. */
function fakeDb(selectResults: Array<any[] | Error>, opts: { failWrites?: boolean } = {}) {
  const writes: Write[] = [];
  const chain = (result: any[] | Error): any => {
    const c: any = {};
    for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy", "groupBy", "limit"]) c[m] = () => c;
    c.then = (resolve: any, reject: any) =>
      (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject);
    return c;
  };
  const writeChain = (entry: Write): any => {
    const c: any = {
      set: (v: any) => {
        entry.set = v;
        return c;
      },
      values: () => c,
      where: () => c,
      returning: () => c,
      onConflictDoNothing: () => c,
      then: (resolve: any, reject: any) =>
        (opts.failWrites ? Promise.reject(new Error("db down")) : Promise.resolve([])).then(resolve, reject),
    };
    return c;
  };
  const db: any = {
    select: () => chain(selectResults.length ? selectResults.shift()! : []),
    update: (table: unknown) => {
      const e: Write = { op: "update", table };
      writes.push(e);
      return writeChain(e);
    },
    insert: (table: unknown) => {
      const e: Write = { op: "insert", table };
      writes.push(e);
      return writeChain(e);
    },
  };
  return { db, writes };
}

const blockWrites = (writes: Write[]) =>
  writes.filter((w) => w.table === schema.campaigns && w.set && "sendBlockReason" in w.set);

function campaign(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    userId: "u1",
    name: "C1",
    status: "running",
    deletedAt: null,
    senderCapUntil: null,
    sendBlockReason: null,
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    dailyLimit: 50,
    maxEmailsPerSenderPerDay: 30,
    leadListId: "list-1",
    templateId: "t1",
    ...over,
  } as any;
}

const env = process.env as Record<string, string | undefined>;
const savedFlag = env.SIGNUP_APPROVAL_REQUIRED;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  if (savedFlag === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = savedFlag;
});

const NIGHT = new Date("2026-11-06T22:00:00.000Z");
const NOON = new Date("2026-11-06T12:00:00.000Z");

describe("sendBlockFor", () => {
  it("clears the reason once something was enqueued", () => {
    expect(sendBlockFor({ enqueued: 3 })).toBeNull();
    expect(sendBlockFor({ enqueued: 2, note: "senders-exhausted" })).toBeNull();
  });
  it("keeps every known reason", () => {
    for (const r of SEND_BLOCK_REASONS) expect(sendBlockFor({ enqueued: 0, note: r })).toBe(r);
  });
  it("leaves the reason alone on a claim race", () => {
    expect(sendBlockFor({ enqueued: 0, note: "claim-race" })).toBeUndefined();
  });
  it("treats other notes as nothing to explain", () => {
    for (const note of ["completed", "waiting-retry", "paced", undefined]) {
      expect(sendBlockFor({ enqueued: 0, note })).toBeNull();
    }
  });
});

describe("recordSendBlock", () => {
  it("writes nothing when the reason is unchanged or undefined", async () => {
    const { db, writes } = fakeDb([]);
    await recordSendBlock(db, { id: "c1", sendBlockReason: "daily-limit" }, "daily-limit", NOON);
    await recordSendBlock(db, { id: "c1", sendBlockReason: null }, null, NOON);
    await recordSendBlock(db, { id: "c1" }, null, NOON);
    await recordSendBlock(db, { id: "c1", sendBlockReason: "daily-limit" }, undefined, NOON);
    expect(writes).toHaveLength(0);
  });
  it("writes the reason and since when it changes", async () => {
    const { db, writes } = fakeDb([]);
    await recordSendBlock(db, { id: "c1", sendBlockReason: null }, "outside-window", NOON);
    expect(writes).toEqual([
      { op: "update", table: schema.campaigns, set: { sendBlockReason: "outside-window", sendBlockSince: NOON.toISOString() } },
    ]);
  });
  it("clears both when the reason becomes null", async () => {
    const { db, writes } = fakeDb([]);
    await recordSendBlock(db, { id: "c1", sendBlockReason: "daily-limit" }, null, NOON);
    expect(writes[0]?.set).toEqual({ sendBlockReason: null, sendBlockSince: null });
  });
  it("never throws", async () => {
    const { db } = fakeDb([], { failWrites: true });
    await expect(recordSendBlock(db, { id: "c1", sendBlockReason: null }, "no-senders", NOON)).resolves.toBeUndefined();
  });
});

describe("schedulerTick records the block reason", () => {
  it("records outside-window for a running campaign outside its window", async () => {
    const { db, writes } = fakeDb([
      [], // startDueCampaigns
      [campaign()],
      [{ id: "u1", role: "user", approvedAt: "2026-01-01" }],
    ]);
    await schedulerTick(db, NIGHT);
    expect(blockWrites(writes).map((w) => w.set.sendBlockReason)).toEqual(["outside-window"]);
  });

  it("does not write again when outside-window is already stored", async () => {
    const { db, writes } = fakeDb([[], [campaign({ sendBlockReason: "outside-window" })], [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]]);
    await schedulerTick(db, NIGHT);
    expect(blockWrites(writes)).toHaveLength(0);
  });

  it("records owner-not-approved for a revoked owner", async () => {
    const { db, writes } = fakeDb([[], [campaign()], [{ id: "u1", role: "user", approvedAt: null }]]);
    await schedulerTick(db, NIGHT);
    expect(blockWrites(writes).map((w) => w.set.sendBlockReason)).toEqual(["owner-not-approved"]);
  });

  it("records nothing about approval when the approval lookup throws", async () => {
    const { db, writes } = fakeDb([[], [campaign()], new Error("users table locked")]);
    const r = await schedulerTick(db, NIGHT);
    expect(r.skipped).toContain("C1: owner-not-approved");
    expect(blockWrites(writes)).toHaveLength(0);
  });
});

describe("scheduleCampaign with no usable mailbox", () => {
  for (const status of ["failed", "paused"]) {
    it(`reports all-paused when every mailbox is ${status}`, async () => {
      const { db } = fakeDb([[]]); // campaignSentToday
      const r = await scheduleCampaign(db, campaign(), NOON, {
        senders: [{ id: "s1", status } as any, { id: "s2", status: "paused" } as any],
      });
      expect(r).toEqual({ enqueued: 0, note: "all-paused" });
    });
  }
});

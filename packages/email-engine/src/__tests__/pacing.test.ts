/**
 * Per-mailbox pacing: the campaign's gap is honoured above a 45 s floor and
 * holds across scheduler ticks (item 22).
 */
import { describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { effectiveGapRange, PACING_HORIZON_SEC } from "@smartreach/shared";
import { createMailboxPacer, nextFreeFromQueued } from "../pacing";
import { scheduleCampaign, sendBlockFor } from "../scheduler";
import type { SenderRow } from "../db-port";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), verifySmtp: vi.fn() }));

const NOW = new Date("2026-11-06T12:00:00.000Z");
const sec = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 1000;

describe("effectiveGapRange", () => {
  it("raises gaps below the 45 s floor", () => {
    expect(effectiveGapRange(5, 10)).toEqual({ min: 45, max: 45 });
  });
  it("honours a slow 5-10 minute gap", () => {
    expect(effectiveGapRange(300, 600)).toEqual({ min: 300, max: 600 });
  });
  it("caps the longest gap at an hour", () => {
    expect(effectiveGapRange(90, 99999)).toEqual({ min: 90, max: 3600 });
  });
  it("falls back to the defaults for unreadable values", () => {
    expect(effectiveGapRange(Number.NaN, undefined)).toEqual({ min: 90, max: 240 });
  });
});

describe("createMailboxPacer", () => {
  const gap = { min: 300, max: 600 };

  it("spaces two emails from one mailbox by at least the shortest gap", () => {
    const pacer = createMailboxPacer({ now: NOW, nextFreeAt: new Map(), gap });
    const a = pacer.take("s1");
    const b = pacer.take("s1");
    expect(sec(a, b)).toBeGreaterThanOrEqual(300);
    expect(sec(a, b)).toBeLessThanOrEqual(600);
  });

  it("starts after the mailbox's last queued email", () => {
    const lastQueued = new Date(NOW.getTime() + 10 * 60_000);
    const nextFreeAt = nextFreeFromQueued([{ senderId: "s1", lastAt: lastQueued.toISOString() }], gap.min);
    const pacer = createMailboxPacer({ now: NOW, nextFreeAt, gap: { min: 60, max: 90 } });
    const at = pacer.take("s1");
    expect(sec(lastQueued, at)).toBeGreaterThanOrEqual(300);
  });

  it("does not book new emails beyond the 15-minute horizon", () => {
    const pacer = createMailboxPacer({
      now: NOW,
      nextFreeAt: new Map([["s1", new Date(NOW.getTime() + (PACING_HORIZON_SEC + 1) * 1000)]]),
      gap,
    });
    expect(pacer.canTake("s1")).toBe(false);
    const open = createMailboxPacer({ now: NOW, nextFreeAt: new Map(), gap, rand: (min) => min });
    expect(open.canTake("s1")).toBe(true);
    open.take("s1"); // now
    open.take("s1"); // +300
    open.take("s1"); // +600
    open.take("s1"); // +900, the horizon itself
    expect(open.canTake("s1")).toBe(false); // next would be +1200
  });

  it("keeps mailboxes independent", () => {
    const pacer = createMailboxPacer({ now: NOW, nextFreeAt: new Map(), gap, rand: (min) => min });
    pacer.take("s1");
    pacer.take("s1");
    expect(sec(NOW, pacer.take("s2"))).toBe(0);
  });

  it("ignores rows with no readable time", () => {
    const map = nextFreeFromQueued(
      [{ senderId: "s1", lastAt: null }, { senderId: "s2", lastAt: "not a date" }, { senderId: null, lastAt: NOW }],
      60,
    );
    expect(map.size).toBe(0);
  });
});

/* ─── scheduleCampaign ──────────────────────────────────────────────────── */

type Handler = any[] | ((call: number) => any[]);
type Write = { op: string; table: unknown; set?: any; values?: any };

/** Selects resolve by table (handlers may vary by call); writes are recorded. */
function tableDb(routes: Map<unknown, Handler>, writeResult: (w: Write) => any[] = () => [{ id: "row" }]) {
  const writes: Write[] = [];
  const counts = new Map<unknown, number>();
  const thenable = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (prop === "then" ? p.then : p.catch).bind(p);
          }
          return (...args: any[]) => {
            onCall?.(String(prop), args);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const db: any = {
    select: () => {
      let table: unknown;
      return thenable(
        () => {
          const n = counts.get(table) ?? 0;
          counts.set(table, n + 1);
          const h = routes.get(table);
          return typeof h === "function" ? h(n) : (h ?? []);
        },
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      writes.push(entry);
      return thenable(
        () => writeResult(entry),
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { db, writes };
}

function sender(): SenderRow {
  return {
    id: "s1",
    userId: "admin",
    senderName: "Alex Kim",
    email: "alex@pool.example",
    dailyLimit: 30,
    hourlyLimit: 30,
    signature: "",
    status: "active",
    isSystemPool: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as SenderRow;
}

function campaign(over: Record<string, unknown> = {}): any {
  return {
    id: "c1",
    userId: "u1",
    name: "Slow and steady",
    status: "running",
    leadListId: "list1",
    templateId: null,
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "00:00",
    sendingWindowEnd: "23:59",
    dailyLimit: 50,
    minDelaySec: 300,
    maxDelaySec: 600,
    maxEmailsPerSenderPerDay: 30,
    stopOnReply: false,
    retryFailed: false,
    retryCount: 0,
    lastSenderIdx: 0,
    ...over,
  };
}

const LEADS = ["l1", "l2", "l3"];

function routes(emailJobs: any[]) {
  return new Map<unknown, Handler>([
    [schema.usageCounters, []],
    [schema.sequenceSteps, [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0 }]],
    [
      schema.sequenceStepVariants,
      [{ id: "v1", stepId: "st1", label: "A", subject: "Hi", bodyText: "Hello there", bodyHtml: "", aiGenerateOnTheFly: false }],
    ],
    [schema.workspaceSettings, [{ postalAddress: "1 Main St, Springfield", unsubscribeBaseUrl: "" }]],
    [schema.campaignLeads, LEADS.map((l, i) => ({ id: `cl${i + 1}`, leadId: l, stepPosition: 1 }))],
    [schema.leads, LEADS.map((l) => ({ id: l, email: `${l}@acme-example.com`, firstName: "Lee" }))],
    [schema.suppressions, []],
    [schema.emailJobs, emailJobs],
  ]);
}

/** The claim update returns every claimable id; other writes return one row. */
const claimAll = (w: Write) =>
  w.op === "update" && w.table === schema.campaignLeads && w.set?.status === "scheduled"
    ? LEADS.map((_, i) => ({ id: `cl${i + 1}` }))
    : [{ id: "row" }];

describe("scheduleCampaign pacing", () => {
  it("spaces one mailbox's emails by the campaign's 5-10 minute gap (no 120 s cap)", async () => {
    const { db, writes } = tableDb(routes([]), claimAll);
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender()] });
    const jobs = writes.filter((w) => w.op === "insert" && w.table === schema.emailJobs).map((w) => w.values);
    expect(r.enqueued).toBe(jobs.length);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    const times = jobs.map((j) => new Date(j.scheduledFor));
    for (let i = 1; i < times.length; i++) {
      const d = sec(times[i - 1]!, times[i]!);
      expect(d).toBeGreaterThanOrEqual(300);
      expect(d).toBeLessThanOrEqual(600);
    }
    // Only what fits in the 15-minute horizon is booked; the rest stays queued.
    expect(sec(NOW, times[times.length - 1]!)).toBeLessThanOrEqual(PACING_HORIZON_SEC);
  });

  it("claims nothing while the only mailbox is booked 20 minutes ahead", async () => {
    const booked = new Date(NOW.getTime() + 20 * 60_000).toISOString();
    const { db, writes } = tableDb(routes([{ senderId: "s1", lastAt: booked }]), claimAll);
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender()] });
    expect(r).toEqual({ enqueued: 0, note: "paced" });
    expect(writes.some((w) => w.table === schema.campaignLeads && w.set?.status === "scheduled")).toBe(false);
    expect(writes.some((w) => w.table === schema.campaigns && w.set?.senderCapUntil)).toBe(false);
    // Pacing is normal sending, never a block reason.
    expect(sendBlockFor(r)).toBeNull();
  });
});

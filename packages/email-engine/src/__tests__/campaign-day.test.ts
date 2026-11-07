/**
 * The campaign daily limit counts per local day in the campaign's timezone;
 * mailbox counters stay on the UTC day (item 23).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import { localDateKey } from "@smartreach/shared";
import { campaignDayKey, releaseSendSlot, reserveSendSlot, todayKey } from "../rotation";
import { processJob } from "../processor";
import type { SenderRow } from "../db-port";

const { transport } = vi.hoisted(() => ({ transport: { sendMail: vi.fn(), close: vi.fn() } }));
vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  makeImapClient: vi.fn(),
}));
vi.mock("../system-mailer", () => ({ isSystemMailerConfigured: () => false, sendSystemEmail: vi.fn() }));

const LATE_UTC = new Date("2024-03-05T23:30:00.000Z");

describe("localDateKey", () => {
  it("uses the calendar date in the timezone", () => {
    expect(localDateKey(LATE_UTC, "Australia/Sydney")).toBe("2024-03-06");
    expect(localDateKey(LATE_UTC, "UTC")).toBe("2024-03-05");
    expect(localDateKey(new Date("2024-03-06T03:00:00.000Z"), "America/Los_Angeles")).toBe("2024-03-05");
  });

  it("falls back to the UTC date for an unknown timezone", () => {
    expect(localDateKey(LATE_UTC, "Not/AZone")).toBe("2024-03-05");
  });
});

describe("campaignDayKey", () => {
  it("uses the campaign's sending timezone", () => {
    expect(campaignDayKey({ sendingTimezone: "Australia/Sydney" }, LATE_UTC)).toBe("2024-03-06");
    expect(campaignDayKey({ sendingTimezone: null }, LATE_UTC)).toBe("2024-03-05");
    expect(campaignDayKey({}, LATE_UTC)).toBe(todayKey(LATE_UTC));
  });
});

/* ─── Fake Drizzle client: selects by table, writes recorded ───────────── */

type Handler = any[] | ((call: number) => any[]);
type Write = { op: string; table: unknown; set?: any; values?: any; where?: any };

function tableDb(routes: Map<unknown, Handler> = new Map()) {
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
        () => [{ id: "row", count: 1 }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { db, writes };
}

const counterInserts = (writes: Write[]) =>
  writes
    .filter((w) => w.op === "insert" && w.table === schema.usageCounters)
    .map((w) => ({ entityType: w.values.entityType, date: w.values.date }));

describe("reserveSendSlot", () => {
  it("writes the mailbox counter under the UTC date and the campaign counter under its local date", async () => {
    const { db, writes } = tableDb();
    const r = await reserveSendSlot(db, {
      userId: "u1",
      senderId: "s1",
      campaignId: "c1",
      senderCap: 30,
      campaignCap: 50,
      date: "2024-03-05",
      campaignDate: "2024-03-06",
    });
    expect(r).toEqual({ ok: true });
    expect(counterInserts(writes)).toEqual([
      { entityType: "sender", date: "2024-03-05" },
      { entityType: "campaign", date: "2024-03-06" },
    ]);
  });

  it("keeps one date for both counters when no campaign date is given", async () => {
    const { db, writes } = tableDb();
    await reserveSendSlot(db, { userId: "u1", senderId: "s1", campaignId: "c1", senderCap: 30, campaignCap: 50, date: "2024-03-05" });
    expect(counterInserts(writes).map((c) => c.date)).toEqual(["2024-03-05", "2024-03-05"]);
  });

  it("releaseSendSlot decrements both counters", async () => {
    const { db, writes } = tableDb();
    await releaseSendSlot(db, { userId: "u1", senderId: "s1", campaignId: "c1", date: "2024-03-05", campaignDate: "2024-03-06" });
    expect(writes.filter((w) => w.op === "update" && w.table === schema.usageCounters)).toHaveLength(2);
  });
});

/* ─── processJob ───────────────────────────────────────────────────────── */

const env = process.env as Record<string, string | undefined>;
const saved = { approval: env.SIGNUP_APPROVAL_REQUIRED, appUrl: env.APP_URL };
afterEach(() => {
  if (saved.approval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = saved.approval;
  if (saved.appUrl === undefined) delete env.APP_URL;
  else env.APP_URL = saved.appUrl;
});

function sender(): SenderRow {
  return {
    id: "s1",
    userId: "admin",
    senderName: "Alex Kim",
    email: "alex@pool.example",
    smtpHost: "h",
    smtpPort: 587,
    smtpUsername: "u",
    smtpPasswordEnc: "",
    smtpSecurity: "tls",
    dailyLimit: 30,
    hourlyLimit: 10,
    fromName: "",
    replyTo: "",
    timezone: "UTC",
    signature: "",
    status: "active",
    health: 100,
    isSystemPool: true,
  } as unknown as SenderRow;
}

describe("processJob", () => {
  it("reserves a Sydney campaign's slot under the next local date at 23:30 UTC", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    transport.sendMail.mockResolvedValue({ messageId: "<m1@pool.example>" });
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.senderAccounts, [sender()]],
        [
          schema.campaigns,
          [
            {
              id: "c1",
              userId: "u1",
              status: "running",
              dailyLimit: 50,
              maxEmailsPerSenderPerDay: 30,
              retryFailed: true,
              trackOpens: false,
              sendingTimezone: "Australia/Sydney",
              sendingWindowStart: "00:00",
              sendingWindowEnd: "23:59",
              businessDaysOnly: false,
            },
          ],
        ],
        [schema.users, [{ id: "u1", role: "user", approvedAt: "2024-01-01" }]],
        [schema.leads, [{ id: "l1", userId: "u1", status: "new", email: "lee@acme-example.com" }]],
        [schema.suppressions, []],
        [schema.workspaceSettings, [{ companyName: "Acme", postalAddress: "1 Main St" }]],
        [schema.usageCounters, []],
        [schema.sequenceSteps, []],
        [schema.emailJobs, []],
      ]),
    );
    const job = {
      id: "job-1",
      senderId: "s1",
      campaignId: "c1",
      campaignLeadId: "cl1",
      leadId: "l1",
      toEmail: "lee@acme-example.com",
      subject: "Hi",
      bodyText: "Hello",
      bodyHtml: "",
      stepPosition: 1,
      status: "processing",
      attempts: 0,
      maxAttempts: 3,
      dryRun: false,
    } as any;
    const outcome = await processJob(db, job, LATE_UTC);
    expect(outcome).toBe("sent");
    const campaignCounter = counterInserts(writes).find((c) => c.entityType === "campaign");
    expect(campaignCounter?.date).toBe("2024-03-06");
    const senderCounter = counterInserts(writes).find((c) => c.entityType === "sender");
    expect(senderCounter?.date).toBe(todayKey());
  });
});

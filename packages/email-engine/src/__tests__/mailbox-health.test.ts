/**
 * Mailbox health: a mailbox fails only after repeated send errors (or a
 * definite auth failure), successful sends reset the streak, and a failed
 * mailbox comes back only through a real SMTP + IMAP login re-test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  MAILBOX_FAILURE_THRESHOLD,
  RETEST_COOLOFF_MS,
  dueForRetest,
  noteSenderSendSucceeded,
  retestFailedSenders,
  senderStatusAfterError,
} from "../mailbox-health";
import { processJob } from "../processor";

vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  makeImapClient: vi.fn(),
  testConnection: vi.fn(),
}));

const { transport } = vi.hoisted(() => ({
  transport: { sendMail: vi.fn(), close: vi.fn() },
}));

/* ─── Fake Drizzle client ───────────────────────────────────────────────── */

type Handler = any[] | ((call: number) => any[]);

function tableDb(routes: Map<unknown, Handler>) {
  const writes: { op: "update" | "insert" | "delete"; table: unknown; set?: any; values?: any }[] = [];
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
      const entry: (typeof writes)[number] = { op, table };
      writes.push(entry);
      return thenable(
        () => [{ id: "row" }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { db, writes };
}

function sender(over: Record<string, unknown> = {}): any {
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
    imapHost: "imap.pool.example",
    imapPort: 993,
    imapUsername: "",
    imapPasswordEnc: "",
    dailyLimit: 30,
    hourlyLimit: 10,
    fromName: "",
    replyTo: "",
    timezone: "UTC",
    signature: "",
    status: "active",
    health: 100,
    smtpStatus: "ok",
    imapStatus: "ok",
    lastSyncAt: null,
    repliedCount: 0,
    isSystemPool: true,
    failureCount: 0,
    failedReason: null,
    lastRetestAt: null,
    deletedAt: null,
    ...over,
  };
}

const NOW = new Date("2026-11-07T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const passing = { smtp: { ok: true, message: "SMTP working" }, imap: { ok: true, message: "IMAP working" } };

/* ─── senderStatusAfterError ───────────────────────────────────────────── */

describe("senderStatusAfterError", () => {
  it("keeps a mailbox active through one or two timeouts and fails it on the third in a row", () => {
    expect(MAILBOX_FAILURE_THRESHOLD).toBe(3);
    expect(senderStatusAfterError({ currentStatus: "active", definiteAuth: false, failureCount: 1 })).toBe("active");
    expect(senderStatusAfterError({ currentStatus: "active", definiteAuth: false, failureCount: 2 })).toBe("active");
    expect(senderStatusAfterError({ currentStatus: "active", definiteAuth: false, failureCount: 3 })).toBe("failed");
  });

  it("fails a mailbox at once on a definite auth error", () => {
    expect(senderStatusAfterError({ currentStatus: "active", definiteAuth: true, failureCount: 1 })).toBe("failed");
  });

  it("never re-activates a paused mailbox", () => {
    expect(senderStatusAfterError({ currentStatus: "paused", definiteAuth: false, failureCount: 1 })).toBe("paused");
  });
});

/* ─── noteSenderSendSucceeded ──────────────────────────────────────────── */

describe("noteSenderSendSucceeded", () => {
  it("resets the error streak", async () => {
    const { db, writes } = tableDb(new Map());
    await noteSenderSendSucceeded(db, "s1");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: "update", table: schema.senderAccounts });
    expect(writes[0].set.failureCount).toBe(0);
    expect(writes[0].set.health).toBeDefined();
  });

  it("never throws", async () => {
    const db: any = {
      update: () => {
        throw new Error("db down");
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(noteSenderSendSucceeded(db, "s1")).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

/* ─── retestFailedSenders ──────────────────────────────────────────────── */

describe("retestFailedSenders", () => {
  it("knows which failed mailboxes are due for a re-test", () => {
    expect(dueForRetest(sender({ status: "failed" }), NOW)).toBe(true);
    expect(dueForRetest(sender({ status: "failed", lastRetestAt: hoursAgo(5) }), NOW)).toBe(false);
    expect(dueForRetest(sender({ status: "failed", lastRetestAt: hoursAgo(6) }), NOW)).toBe(true);
    expect(dueForRetest(sender({ status: "active" }), NOW)).toBe(false);
    expect(dueForRetest(sender({ status: "failed", deletedAt: hoursAgo(1) }), NOW)).toBe(false);
    expect(RETEST_COOLOFF_MS).toBe(6 * 3_600_000);
  });

  it("re-activates only when both SMTP and IMAP logins pass, and logs sender.recovered", async () => {
    const box = sender({ status: "failed", failureCount: 3, failedReason: "timeout", imapFailCount: 2 });
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, [box]]]));
    const testConnection = vi.fn(async () => passing);
    const r = await retestFailedSenders(db, NOW, { testConnection });
    expect(r).toEqual({ tested: 1, recovered: 1 });
    expect(testConnection).toHaveBeenCalledWith(box);
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    expect(update?.set).toMatchObject({
      status: "active",
      smtpStatus: "ok",
      imapStatus: "ok",
      failureCount: 0,
      failedReason: null,
      imapFailCount: 0,
      lastRetestAt: NOW.toISOString(),
    });
    const log = writes.find((w) => w.op === "insert" && w.table === schema.activityLogs);
    expect(log?.values).toMatchObject({
      userId: "admin",
      type: "sender.recovered",
      message: "alex@pool.example passed an automatic login test and is back in rotation",
    });
  });

  it("leaves the mailbox failed when either login fails, recording only the attempt", async () => {
    for (const result of [
      { smtp: { ok: false, message: "SMTP failed: 535" }, imap: { ok: true, message: "ok" } },
      { smtp: { ok: true, message: "ok" }, imap: { ok: false, message: "IMAP failed" } },
    ]) {
      const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, [sender({ status: "failed" })]]]));
      const r = await retestFailedSenders(db, NOW, { testConnection: async () => result });
      expect(r).toEqual({ tested: 1, recovered: 0 });
      const update = writes.find((w) => w.op === "update");
      expect(update?.set).not.toHaveProperty("status");
      expect(update?.set.lastRetestAt).toBe(NOW.toISOString());
      expect(writes.some((w) => w.op === "insert")).toBe(false);
    }
  });

  it("treats a login test that throws as a failure", async () => {
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, [sender({ status: "failed" })]]]));
    const r = await retestFailedSenders(db, NOW, {
      testConnection: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(r.recovered).toBe(0);
    expect(writes.find((w) => w.op === "update")?.set).toMatchObject({ smtpStatus: "failed", imapStatus: "failed" });
  });

  it("skips mailboxes inside the 6h cool-off without testing them", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([[schema.senderAccounts, [sender({ status: "failed", lastRetestAt: hoursAgo(2) })]]]),
    );
    const testConnection = vi.fn(async () => passing);
    expect(await retestFailedSenders(db, NOW, { testConnection })).toEqual({ tested: 0, recovered: 0 });
    expect(testConnection).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("tests at most 5 mailboxes per run", async () => {
    const boxes = Array.from({ length: 8 }, (_, i) => sender({ id: `s${i}`, status: "failed" }));
    const { db } = tableDb(new Map<unknown, Handler>([[schema.senderAccounts, boxes]]));
    const testConnection = vi.fn(async () => ({ smtp: { ok: false, message: "x" }, imap: { ok: false, message: "x" } }));
    await retestFailedSenders(db, NOW, { testConnection });
    expect(testConnection).toHaveBeenCalledTimes(5);
  });
});

/* ─── processJob: consecutive errors, not single timeouts, fail a mailbox ── */

const env = process.env as Record<string, string | undefined>;
const savedApproval = env.SIGNUP_APPROVAL_REQUIRED;
const savedAppUrl = env.APP_URL;

function job(over: Record<string, unknown> = {}): any {
  return {
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
    ...over,
  };
}

function processorDb(box: any) {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  env.APP_URL = "https://autogtm.example";
  return tableDb(
    new Map<unknown, Handler>([
      [schema.senderAccounts, [box]],
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
            sendingTimezone: "UTC",
            sendingWindowStart: "00:00",
            sendingWindowEnd: "23:59",
            businessDaysOnly: false,
          },
        ],
      ],
      [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
      [schema.leads, [{ id: "l1", userId: "u1", status: "new", email: "lee@acme-example.com" }]],
      [schema.suppressions, []],
      [schema.workspaceSettings, [{ companyName: "Acme", postalAddress: "1 Main St" }]],
      [schema.usageCounters, []],
      [schema.sequenceSteps, []],
      [schema.emailJobs, []],
    ]),
  );
}

const timeout = () => Object.assign(new Error("Connection timed out"), { code: "ETIMEDOUT" });

describe("processJob mailbox failures", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    transport.sendMail.mockReset();
  });
  afterEach(() => {
    errSpy.mockRestore();
    if (savedApproval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
    else env.SIGNUP_APPROVAL_REQUIRED = savedApproval;
    if (savedAppUrl === undefined) delete env.APP_URL;
    else env.APP_URL = savedAppUrl;
  });

  it("a transient connection error counts one failure, keeps the mailbox active and logs nothing", async () => {
    transport.sendMail.mockRejectedValue(timeout());
    const { db, writes } = processorDb(sender({ failureCount: 0, health: 40 }));
    const outcome = await processJob(db, job(), NOW);
    expect(outcome).toBe("retry");
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    // Low health alone no longer fails a mailbox.
    expect(update?.set).toMatchObject({ failureCount: 1, status: "active" });
    expect(update?.set).not.toHaveProperty("failedReason");
    expect(writes.some((w) => w.op === "insert" && w.values?.type === "sender.failed")).toBe(false);
  });

  it("at the threshold it fails the mailbox and writes a sender.failed activity row with the reason", async () => {
    transport.sendMail.mockRejectedValue(timeout());
    const { db, writes } = processorDb(sender({ failureCount: MAILBOX_FAILURE_THRESHOLD - 1 }));
    await processJob(db, job(), NOW);
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    expect(update?.set).toMatchObject({ failureCount: 3, status: "failed" });
    expect(update?.set.failedReason).toContain("Connection timed out");
    const log = writes.find((w) => w.op === "insert" && w.values?.type === "sender.failed");
    expect(log?.values).toMatchObject({ userId: "admin", meta: { senderId: "s1" } });
    expect(log?.values.message).toContain("alex@pool.example was taken out of rotation after 3 errors in a row");
    expect(log?.values.meta.reason).toContain("Connection timed out");
  });

  it("a definite auth failure fails the mailbox at once", async () => {
    transport.sendMail.mockRejectedValue(
      Object.assign(new Error("Invalid login"), { responseCode: 535, response: "535 5.7.8 Authentication failed" }),
    );
    const { db, writes } = processorDb(sender({ failureCount: 0 }));
    await processJob(db, job(), NOW);
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    expect(update?.set).toMatchObject({ failureCount: 1, status: "failed" });
    expect(writes.some((w) => w.op === "insert" && w.values?.type === "sender.failed")).toBe(true);
  });

  it("a successful send resets the error streak", async () => {
    transport.sendMail.mockResolvedValue({ messageId: "<ok@pool.example>" });
    const { db, writes } = processorDb(sender({ failureCount: 2, health: 80 }));
    expect(await processJob(db, job({ id: "job-ok" }), NOW)).toBe("sent");
    const reset = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts && w.set?.failureCount === 0);
    expect(reset).toBeDefined();
  });
});

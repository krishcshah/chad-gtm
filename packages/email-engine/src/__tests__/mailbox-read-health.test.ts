/**
 * #60: a paused mailbox, or one whose inbox login failed, must still have its
 * replies read; follow-ups wait for their own mailbox instead of going out
 * blind or from another persona.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  imapRetryDelayMs,
  REPLIES_UNREADABLE_HOLD_REASON,
  repliesUnreadable,
  shouldSyncMailbox,
} from "../mailbox-health";
import { processJob } from "../processor";
import { syncTick } from "../sync-replies";
import { makeImapClient } from "../mailer";

vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  makeImapClient: vi.fn(),
  testConnection: vi.fn(),
}));

const { transport } = vi.hoisted(() => ({
  transport: { sendMail: vi.fn(), close: vi.fn() },
}));

const NOW = new Date("2026-11-06T12:00:00Z");
const MIN = 60_000;
const DAY = 86_400_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const inbox = { imapHost: "imap.pool.example", imapPasswordEnc: "enc" };

describe("imapRetryDelayMs", () => {
  it("grows 15m, 30m, 1h, 2h ... and is capped at 24h", () => {
    expect(imapRetryDelayMs(1)).toBe(15 * MIN);
    expect(imapRetryDelayMs(2)).toBe(30 * MIN);
    expect(imapRetryDelayMs(3)).toBe(60 * MIN);
    expect(imapRetryDelayMs(4)).toBe(120 * MIN);
    expect(imapRetryDelayMs(8)).toBe(DAY);
    expect(imapRetryDelayMs(50)).toBe(DAY);
    expect(imapRetryDelayMs(0)).toBe(15 * MIN);
  });
});

describe("shouldSyncMailbox", () => {
  it("syncs a paused mailbox (its replies still have to be read)", () => {
    expect(shouldSyncMailbox({ ...inbox, imapStatus: "ok" }, NOW)).toBe(true);
  });
  it("syncs a mailbox retired 10 days ago, not one retired 31 days ago", () => {
    expect(shouldSyncMailbox({ ...inbox, imapStatus: "ok", deletedAt: ago(10 * DAY) }, NOW)).toBe(true);
    expect(shouldSyncMailbox({ ...inbox, imapStatus: "ok", deletedAt: ago(31 * DAY) }, NOW)).toBe(false);
  });
  it("retries a failed inbox login only after the backoff has passed", () => {
    const failed = { ...inbox, imapStatus: "failed", imapFailCount: 2 };
    expect(shouldSyncMailbox({ ...failed, imapAttemptedAt: ago(10 * MIN) }, NOW)).toBe(false);
    expect(shouldSyncMailbox({ ...failed, imapAttemptedAt: ago(31 * MIN) }, NOW)).toBe(true);
    expect(shouldSyncMailbox({ ...failed, imapAttemptedAt: null }, NOW)).toBe(true);
  });
  it("never syncs a mailbox with no inbox configured", () => {
    expect(shouldSyncMailbox({ imapHost: "", imapPasswordEnc: "enc", imapStatus: "ok" }, NOW)).toBe(false);
    expect(shouldSyncMailbox({ imapHost: "imap.x", imapPasswordEnc: "", imapStatus: "ok" }, NOW)).toBe(false);
  });
});

describe("repliesUnreadable", () => {
  it("is true only when an inbox exists and its login is failing", () => {
    expect(repliesUnreadable({ imapHost: "imap.x", imapStatus: "failed" })).toBe(true);
    expect(repliesUnreadable({ imapHost: "imap.x", imapStatus: "ok" })).toBe(false);
    expect(repliesUnreadable({ imapHost: "", imapStatus: "failed" })).toBe(false);
  });
});

/* ─── fake db ──────────────────────────────────────────────────────────── */

type Write = { op: "update" | "insert" | "delete"; table: unknown; set?: any; values?: any };

function fakeDb(routes: Map<unknown, any[]>) {
  const writes: Write[] = [];
  const chain = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const p = Promise.resolve().then(resolve);
            return p.then.bind(p);
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
      return chain(
        () => routes.get(table) ?? [],
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
      return chain(
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

/* ─── processJob ───────────────────────────────────────────────────────── */

const env = process.env as Record<string, string | undefined>;
const saved = { approval: env.SIGNUP_APPROVAL_REQUIRED, appUrl: env.APP_URL };
afterEach(() => {
  if (saved.approval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = saved.approval;
  if (saved.appUrl === undefined) delete env.APP_URL;
  else env.APP_URL = saved.appUrl;
});
beforeEach(() => {
  transport.sendMail.mockReset();
  transport.sendMail.mockResolvedValue({ messageId: "<m@pool.example>" });
  vi.mocked(makeImapClient).mockReset();
});

function job(over: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    campaignId: "c1",
    campaignLeadId: "cl1",
    senderId: "s1",
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
  } as any;
}

function routes(senderOver: Record<string, unknown> = {}) {
  return new Map<unknown, any[]>([
    [
      schema.senderAccounts,
      [{ id: "s1", userId: "admin", email: "alex@pool.example", status: "active", dailyLimit: 30, ...senderOver }],
    ],
    [
      schema.campaigns,
      [
        {
          id: "c1",
          userId: "u1",
          name: "C1",
          status: "running",
          deletedAt: null,
          dailyLimit: 50,
          maxEmailsPerSenderPerDay: 30,
          retryFailed: true,
          trackOpens: false,
          stopOnReply: true,
          sendingTimezone: "UTC",
          sendingWindowStart: "09:00",
          sendingWindowEnd: "17:00",
          businessDaysOnly: false,
        },
      ],
    ],
    [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
    [schema.leads, [{ id: "l1", userId: "u1", status: "contacted", email: "lee@acme-example.com" }]],
    [schema.suppressions, []],
    [schema.workspaceSettings, [{ companyName: "Acme", postalAddress: "1 Main St, Springfield, IL 62701" }]],
    [schema.usageCounters, []],
    [schema.sequenceSteps, []],
    [schema.emailJobs, []],
  ]);
}

describe("processJob when the mailbox's replies can't be read", () => {
  const unreadable = { imapHost: "imap.pool.example", imapStatus: "failed" };

  it("holds a follow-up on its own mailbox and sends nothing", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    const { db, writes } = fakeDb(routes(unreadable));
    const outcome = await processJob(db, job({ stepPosition: 2 }), NOW);
    expect(outcome).toBe("held");
    expect(transport.sendMail).not.toHaveBeenCalled();
    const hold = writes.find((w) => w.op === "update" && w.table === schema.emailJobs);
    expect(hold?.set).toMatchObject({ status: "pending", lastError: REPLIES_UNREADABLE_HOLD_REASON });
    expect(writes.some((w) => w.op === "delete" && w.table === schema.emailJobs)).toBe(false);
  });

  it("releases a step-1 job to the scheduler so a readable mailbox takes it", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    const { db, writes } = fakeDb(routes(unreadable));
    const outcome = await processJob(db, job({ stepPosition: 1 }), NOW);
    expect(outcome).toBe("skipped");
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(writes.some((w) => w.op === "delete" && w.table === schema.emailJobs)).toBe(true);
    const requeue = writes.find((w) => w.op === "update" && w.table === schema.campaignLeads);
    expect(requeue?.set).toMatchObject({ status: "queued", lastError: "sender-replies-unreadable" });
  });

  it("still sends when the inbox is readable", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    const { db } = fakeDb(routes({ imapHost: "imap.pool.example", imapStatus: "ok" }));
    expect(await processJob(db, job({ stepPosition: 2 }), NOW)).toBe("sent");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
});

/* ─── syncTick ─────────────────────────────────────────────────────────── */

function mailbox(over: Record<string, unknown>) {
  return {
    id: "m1",
    email: "m1@pool.example",
    status: "active",
    imapHost: "imap.pool.example",
    imapPasswordEnc: "enc",
    imapStatus: "ok",
    imapFailCount: 0,
    imapAttemptedAt: null,
    lastSyncAt: null,
    deletedAt: null,
    ...over,
  };
}

function okClient() {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    mailboxOpen: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    fetch: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    usable: true,
  };
}

describe("syncTick", () => {
  it("reads paused mailboxes and skips a failed login still inside its backoff", async () => {
    const paused = mailbox({ id: "p", email: "p@pool.example", status: "paused" });
    const waiting = mailbox({
      id: "w",
      email: "w@pool.example",
      imapStatus: "failed",
      imapFailCount: 3,
      imapAttemptedAt: new Date(Date.now() - 5 * MIN).toISOString(),
    });
    vi.mocked(makeImapClient).mockImplementation(() => okClient() as any);
    const { db } = fakeDb(new Map([[schema.senderAccounts, [paused, waiting]]]));
    const r = await syncTick(db);
    expect(r.checked).toBe(1);
    expect(vi.mocked(makeImapClient).mock.calls.map((c) => (c[0] as any).id)).toEqual(["p"]);
  });

  it("an auth failure counts up imapFailCount and stamps imapAttemptedAt", async () => {
    const box = mailbox({ id: "a", imapFailCount: 1, imapStatus: "failed", imapAttemptedAt: null });
    vi.mocked(makeImapClient).mockImplementation(
      () =>
        ({
          ...okClient(),
          connect: vi.fn().mockRejectedValue(new Error("AUTHENTICATIONFAILED Invalid credentials")),
          usable: false,
        }) as any,
    );
    const { db, writes } = fakeDb(new Map([[schema.senderAccounts, [box]]]));
    const r = await syncTick(db);
    expect(r.errors).toHaveLength(1);
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    expect(update?.set).toMatchObject({ imapStatus: "failed", imapFailCount: 2 });
    expect(typeof update?.set.imapAttemptedAt).toBe("string");
  });

  it("a successful read resets the failure count", async () => {
    const box = mailbox({ id: "a", imapFailCount: 4, imapStatus: "failed", imapAttemptedAt: null });
    vi.mocked(makeImapClient).mockImplementation(() => okClient() as any);
    const { db, writes } = fakeDb(new Map([[schema.senderAccounts, [box]]]));
    await syncTick(db);
    const update = writes.find((w) => w.op === "update" && w.table === schema.senderAccounts);
    expect(update?.set).toMatchObject({ imapStatus: "ok", imapFailCount: 0 });
  });
});

/**
 * #16: a paused or archived campaign's queued jobs must not clog the shared
 * send queue, and a resumed backlog must not go out all at once or outside
 * the sending window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import {
  claimDueJobs,
  processJob,
  processTick,
  releaseCampaignJobs,
  releaseInactiveCampaignJobs,
} from "../processor";

vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  makeImapClient: vi.fn(),
}));

const { transport } = vi.hoisted(() => ({
  transport: { sendMail: vi.fn(), close: vi.fn() },
}));

const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as any);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();

type Write = { op: "update" | "insert" | "delete"; table: unknown; set?: any; values?: any };

/** Selects resolve by table; writes are recorded; .where() args are captured. */
function fakeDb(routes: Map<unknown, any[]>, opts: { execute?: (q: unknown) => any } = {}) {
  const writes: Write[] = [];
  const wheres: unknown[] = [];
  const executed: unknown[] = [];
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
          if (prop === "where") wheres.push(args[0]);
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
  if (opts.execute) {
    db.execute = async (q: unknown) => {
      executed.push(q);
      return opts.execute!(q);
    };
  }
  return { db, writes, wheres, executed };
}

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

function campaignRow(over: Record<string, unknown> = {}) {
  return {
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
    ...over,
  };
}

function routes(campaign: Record<string, unknown>) {
  return new Map<unknown, any[]>([
    [schema.senderAccounts, [{ id: "s1", userId: "admin", email: "alex@pool.example", status: "active", dailyLimit: 30 }]],
    [schema.campaigns, [campaign]],
    [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
    [schema.leads, [{ id: "l1", userId: "u1", status: "new", email: "lee@acme-example.com" }]],
    [schema.suppressions, []],
    [schema.workspaceSettings, [{ companyName: "Acme", postalAddress: "1 Main St, Springfield, IL 62701" }]],
    [schema.usageCounters, []],
    [schema.sequenceSteps, []],
    [schema.emailJobs, []],
  ]);
}

describe("releaseCampaignJobs", () => {
  it("deletes the campaign's pending/retry jobs and re-queues their leads in one statement", async () => {
    const { db, executed, writes } = fakeDb(new Map(), { execute: () => ({ rows: [{ id: "a" }, { id: "b" }] }) });
    const n = await releaseCampaignJobs(db, "camp-9", "campaign-paused", new Date("2026-11-06T12:00:00Z"));
    expect(n).toBe(2);
    expect(executed).toHaveLength(1);
    expect(writes).toHaveLength(0);
    const q = render(executed[0]);
    const text = squash(q.sql);
    expect(text).toMatch(/DELETE FROM email_jobs WHERE campaign_id = \$\d+ AND status IN \('pending','retry'\)/);
    expect(text).toMatch(/UPDATE campaign_leads SET status = 'queued'/);
    expect(text).toMatch(/WHERE id IN \(SELECT campaign_lead_id FROM released\) AND status = 'scheduled'/);
    expect(text).not.toContain("'processing'");
    expect(text).not.toContain("cancelled");
    expect(q.params).toContain("camp-9");
    expect(q.params).toContain("campaign-paused");
    expect(q.params).toContain("2026-11-06T12:00:00.000Z");
  });

  it("counts array-shaped results too", async () => {
    const { db } = fakeDb(new Map(), { execute: () => [{ id: "a" }] });
    expect(await releaseCampaignJobs(db, "c1", "campaign-archived")).toBe(1);
  });
});

describe("releaseInactiveCampaignJobs", () => {
  it("targets campaigns that are not running/scheduled or are deleted", async () => {
    const { db, executed } = fakeDb(new Map(), { execute: () => ({ rows: [] }) });
    expect(await releaseInactiveCampaignJobs(db, new Date("2026-11-06T12:00:00Z"))).toBe(0);
    const q = render(executed[0]);
    const text = squash(q.sql);
    expect(text).toContain("DELETE FROM email_jobs j USING campaigns c");
    expect(text).toContain("j.status IN ('pending','retry')");
    expect(text).toContain("c.status NOT IN ('running','scheduled') OR c.deleted_at IS NOT NULL");
    expect(text).toContain("UPDATE campaign_leads SET status = 'queued'");
    expect(text).not.toContain("cancelled");
    expect(q.params).toContain("campaign-not-running");
  });
});

describe("claimDueJobs", () => {
  it("only claims jobs whose campaign is running or scheduled", async () => {
    const { db, wheres } = fakeDb(new Map([[schema.emailJobs, []]]));
    await claimDueJobs(db, new Date("2026-11-06T12:00:00Z"));
    const text = squash(render(wheres[0]).sql);
    expect(text).toContain('EXISTS (SELECT 1 FROM "campaigns" WHERE "campaigns"."id" = "email_jobs"."campaign_id"');
    expect(text).toContain(`"campaigns"."status" IN ('running','scheduled')`);
    expect(text).toContain('"campaigns"."deleted_at" IS NULL');
  });
});

describe("processJob for a campaign that stopped sending", () => {
  for (const status of ["paused", "archived"]) {
    it(`a ${status} campaign's job is deleted and its lead re-queued, never sent`, async () => {
      delete env.SIGNUP_APPROVAL_REQUIRED;
      const { db, writes } = fakeDb(routes(campaignRow({ status })));
      const outcome = await processJob(db, job(), new Date("2026-11-06T12:00:00Z"));
      expect(outcome).toBe("skipped");
      expect(writes.some((w) => w.op === "delete" && w.table === schema.emailJobs)).toBe(true);
      const requeue = writes.find((w) => w.op === "update" && w.table === schema.campaignLeads);
      expect(requeue?.set).toMatchObject({ status: "queued", lastError: "campaign-not-running" });
      expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "cancelled")).toBe(false);
      expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "pending")).toBe(false);
      expect(transport.sendMail).not.toHaveBeenCalled();
    });
  }
});

describe("processJob outside the sending window", () => {
  it("releases the job back to the scheduler, returns held and does not send", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    const { db, writes } = fakeDb(routes(campaignRow()));
    const outcome = await processJob(db, job(), new Date("2026-11-06T22:00:00Z"));
    expect(outcome).toBe("held");
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(writes.some((w) => w.op === "delete" && w.table === schema.emailJobs)).toBe(true);
    const requeue = writes.find((w) => w.op === "update" && w.table === schema.campaignLeads);
    expect(requeue?.set).toMatchObject({ status: "queued", lastError: "outside-sending-window" });
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "cancelled")).toBe(false);
  });

  it("still sends inside the window", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    const { db } = fakeDb(routes(campaignRow()));
    const outcome = await processJob(db, job(), new Date("2026-11-06T12:00:00Z"));
    expect(outcome).toBe("sent");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("processTick sweep", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("runs the release sweep before claiming", async () => {
    const { db, executed, wheres } = fakeDb(new Map([[schema.emailJobs, []]]), { execute: () => ({ rows: [] }) });
    await processTick(db, new Date("2026-11-06T12:00:00Z"));
    expect(executed).toHaveLength(1);
    expect(squash(render(executed[0]).sql)).toContain("USING campaigns c");
    expect(wheres.length).toBeGreaterThan(0);
  });

  it("keeps working when db.execute is missing", async () => {
    const { db, wheres } = fakeDb(new Map([[schema.emailJobs, []]]));
    const r = await processTick(db, new Date("2026-11-06T12:00:00Z"));
    expect(r.sent).toBe(0);
    expect(errSpy).toHaveBeenCalled();
    expect(wheres.length).toBeGreaterThan(0); // still claimed
  });

  it("keeps working when the sweep throws", async () => {
    const { db, wheres } = fakeDb(new Map([[schema.emailJobs, []]]), {
      execute: () => {
        throw new Error("lock timeout");
      },
    });
    const r = await processTick(db, new Date("2026-11-06T12:00:00Z"));
    expect(r.failed).toBe(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("releasing jobs"), expect.any(Error));
    expect(wheres.length).toBeGreaterThan(0);
  });
});

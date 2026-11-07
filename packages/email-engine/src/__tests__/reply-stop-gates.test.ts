/**
 * #30: once a person replied (any later outcome too), campaigns with "Stop on
 * reply" on stop them at claim time (scheduler) and at send time (processor).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import { processJob } from "../processor";
import { scheduleCampaign } from "../scheduler";
import type { SenderRow } from "../db-port";

vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  verifySmtp: vi.fn(),
  makeImapClient: vi.fn(),
}));

const { transport } = vi.hoisted(() => ({
  transport: { sendMail: vi.fn(), close: vi.fn() },
}));

const dialect = new PgDialect();
const NOW = new Date("2026-11-06T12:00:00.000Z");

type Write = { op: "update" | "insert" | "delete"; table: unknown; set?: any; values?: any };

/** Selects resolve by table; writes are recorded; WHEREs of selects are captured per table. */
function fakeDb(routes: Map<unknown, any[]>) {
  const writes: Write[] = [];
  const wheres: { table: unknown; where: unknown }[] = [];
  const chain = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (p as any)[prop].bind(p);
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
          if (prop === "where") wheres.push({ table, where: args[0] });
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
  return { db, writes, wheres };
}

const env = process.env as Record<string, string | undefined>;
const saved = { approval: env.SIGNUP_APPROVAL_REQUIRED, appUrl: env.APP_URL };
beforeEach(() => {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  env.APP_URL = "https://autogtm.example";
  transport.sendMail.mockReset();
  transport.sendMail.mockResolvedValue({ messageId: "<m@pool.example>" });
});
afterEach(() => {
  if (saved.approval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = saved.approval;
  if (saved.appUrl === undefined) delete env.APP_URL;
  else env.APP_URL = saved.appUrl;
});

function job() {
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
  } as any;
}

function processRoutes(leadStatus: string, stopOnReply: boolean) {
  return new Map<unknown, any[]>([
    [schema.senderAccounts, [{ id: "s1", userId: "admin", email: "alex@pool.example", status: "active", dailyLimit: 30 }]],
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
          stopOnReply,
          sendingTimezone: "UTC",
          sendingWindowStart: "09:00",
          sendingWindowEnd: "17:00",
          businessDaysOnly: false,
        },
      ],
    ],
    [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
    [schema.leads, [{ id: "l1", userId: "u1", status: leadStatus, email: "lee@acme-example.com" }]],
    [schema.suppressions, []],
    [schema.workspaceSettings, [{ companyName: "Acme", postalAddress: "1 Main St, Springfield, IL 62701" }]],
    [schema.usageCounters, []],
    [schema.sequenceSteps, []],
    [schema.emailJobs, []],
  ]);
}

describe("processJob send-time gate", () => {
  for (const status of ["replied", "interested", "meeting_booked", "won", "lost"]) {
    it(`cancels a job whose lead is '${status}' when stopOnReply is on`, async () => {
      const { db, writes } = fakeDb(processRoutes(status, true));
      const outcome = await processJob(db, job(), NOW);
      expect(outcome).toBe("skipped");
      expect(transport.sendMail).not.toHaveBeenCalled();
      const cancel = writes.find((w) => w.table === schema.emailJobs && w.set?.status === "cancelled");
      expect(cancel?.set.lastError).toBe("lead-no-longer-sendable");
    });
  }

  it("keeps sending an 'interested' lead when the campaign's stopOnReply is off", async () => {
    const { db } = fakeDb(processRoutes("interested", false));
    const outcome = await processJob(db, job(), NOW);
    expect(outcome).not.toBe("skipped");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
});

describe("scheduleCampaign claim-time filter", () => {
  function scheduleRoutes() {
    return new Map<unknown, any[]>([
      [schema.usageCounters, []],
      [schema.sequenceSteps, [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0 }]],
      [
        schema.sequenceStepVariants,
        [{ id: "v1", stepId: "st1", label: "A", subject: "Hi", bodyText: "Hello", bodyHtml: "", aiGenerateOnTheFly: false }],
      ],
      [schema.workspaceSettings, [{ postalAddress: "1 Main St, Springfield", unsubscribeBaseUrl: "" }]],
      [schema.campaignLeads, []],
      [schema.leads, []],
      [schema.suppressions, []],
      [schema.emailJobs, []],
    ]);
  }
  const sender = {
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
  const campaign = (stopOnReply: boolean): any => ({
    id: "c1",
    userId: "u1",
    name: "C1",
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
    stopOnReply,
    retryFailed: false,
    retryCount: 0,
    lastSenderIdx: 0,
  });
  const claimSql = (wheres: { table: unknown; where: unknown }[]) =>
    wheres
      .filter((w) => w.table === schema.campaignLeads && w.where)
      .map((w) => dialect.sqlToQuery(w.where as any).sql.replace(/\s+/g, " "))
      .find((s) => s.includes("'queued'") || s.includes('"status" = $')) ?? "";

  it("skips people whose lead row says they replied (any later outcome too)", async () => {
    const { db, wheres } = fakeDb(scheduleRoutes());
    await scheduleCampaign(db, campaign(true), NOW, { senders: [sender] });
    const text = claimSql(wheres);
    expect(text).toContain(
      "NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = campaign_leads.lead_id AND l.status IN ('replied','interested','meeting_booked','won','lost'))",
    );
  });

  it("does not filter on replies when stopOnReply is off", async () => {
    const { db, wheres } = fakeDb(scheduleRoutes());
    await scheduleCampaign(db, campaign(false), NOW, { senders: [sender] });
    expect(claimSql(wheres)).not.toContain("FROM leads l");
  });
});

/**
 * A reply synced while an email to the same lead is in flight must win: the
 * send's bookkeeping marks the job sent, but never requeues the next step or
 * moves the lead back to 'contacted' (audit #37).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { processJob } from "../processor";
import { advanceSequenceAfterSend } from "../sequence";

vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  makeImapClient: vi.fn(),
}));

const { transport } = vi.hoisted(() => ({
  transport: { sendMail: vi.fn(), close: vi.fn() },
}));

const dialect = new PgDialect();
const env = process.env as Record<string, string | undefined>;
const saved = { approval: env.SIGNUP_APPROVAL_REQUIRED, appUrl: env.APP_URL, dry: env.ENGINE_DRY_RUN };

afterEach(() => {
  for (const [k, v] of [
    ["SIGNUP_APPROVAL_REQUIRED", saved.approval],
    ["APP_URL", saved.appUrl],
    ["ENGINE_DRY_RUN", saved.dry],
  ] as const) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
});

type State = { campaignLead: string; lead: string };
type Write = { op: string; table: unknown; set?: any; applied: boolean };

/**
 * Fake Drizzle client with a tiny bit of real state: updates to
 * campaign_leads and leads apply only when their WHERE status guard (if any)
 * matches the current status, like Postgres would.
 */
function stateDb(state: State, steps: { position: number; delayDays: number }[]) {
  const writes: Write[] = [];
  const routes = new Map<unknown, () => any[]>([
    [
      schema.senderAccounts,
      () => [
        {
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
          status: "active",
          health: 100,
          smtpStatus: "ok",
          imapStatus: "ok",
          timezone: "UTC",
        },
      ],
    ],
    [
      schema.campaigns,
      () => [
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
    [schema.users, () => [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
    [schema.leads, () => [{ id: "l1", userId: "u1", status: state.lead, email: "lee@acme-example.com" }]],
    [schema.workspaceSettings, () => [{ companyName: "Acme", postalAddress: "1 Main St" }]],
    [schema.sequenceSteps, () => steps.map((s) => ({ id: `st${s.position}`, campaignId: "c1", type: "follow_up", ...s }))],
  ]);

  const chain = (resolve: () => any, onCall: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then" || prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return (p as any)[prop].bind(p);
          }
          return (...args: any[]) => {
            onCall(String(prop), args);
            return proxy;
          };
        },
      },
    );
    return proxy;
  };

  const guardAllows = (table: unknown, where: SQL | undefined): boolean => {
    if (!where) return true;
    const q = dialect.sqlToQuery(where);
    if (table === schema.campaignLeads && /"campaign_leads"\."status" = \$\d+/.test(q.sql)) {
      return q.params.includes(state.campaignLead);
    }
    if (table === schema.leads && /"leads"\."status" in \(/.test(q.sql)) {
      return q.params.includes(state.lead);
    }
    return true;
  };

  const db: any = {
    select: () => {
      let table: unknown;
      return chain(
        () => routes.get(table)?.() ?? [],
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table, applied: false };
      writes.push(entry);
      let where: SQL | undefined;
      return chain(
        () => {
          if (op !== "update" || (table !== schema.campaignLeads && table !== schema.leads)) {
            entry.applied = true;
            return [{ id: "row" }];
          }
          if (!guardAllows(table, where)) return [];
          entry.applied = true;
          if (table === schema.campaignLeads && entry.set?.status) state.campaignLead = entry.set.status;
          if (table === schema.leads && entry.set?.status) state.lead = entry.set.status;
          return [{ id: "row" }];
        },
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "where") where = args[0];
        },
      );
    };
  }
  return { db, writes };
}

function job(over: Record<string, unknown> = {}): any {
  return {
    id: "job-race",
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

const TWO_STEPS = [
  { position: 1, delayDays: 0 },
  { position: 2, delayDays: 3 },
];

describe("advanceSequenceAfterSend", () => {
  it("only moves a lead that is still 'scheduled'", async () => {
    const { db, writes } = stateDb({ campaignLead: "scheduled", lead: "new" }, TWO_STEPS);
    const spy = vi.spyOn(db, "update");
    const out = await advanceSequenceAfterSend(db, {
      campaignId: "c1",
      campaignLeadId: "cl1",
      stepPosition: 1,
      sentAt: "2026-11-06T12:00:00.000Z",
      steps: TWO_STEPS.map((s) => ({ id: `st${s.position}`, campaignId: "c1", type: "follow_up" as const, ...s })),
    });
    expect(out).toBe("requeued");
    expect(spy).toHaveBeenCalledWith(schema.campaignLeads);
    expect(writes[0]).toMatchObject({ table: schema.campaignLeads, applied: true, set: { status: "queued", stepPosition: 2 } });
  });

  it("renders a status = 'scheduled' guard on both branches", async () => {
    for (const steps of [TWO_STEPS, [{ position: 1, delayDays: 0 }]]) {
      const wheres: SQL[] = [];
      const db: any = {
        update: () => {
          const c: any = {
            set: () => c,
            where: (w: SQL) => {
              wheres.push(w);
              return c;
            },
            returning: () => Promise.resolve([{ id: "cl1" }]),
            then: (res: any, rej: any) => Promise.resolve([]).then(res, rej),
          };
          return c;
        },
      };
      await advanceSequenceAfterSend(db, {
        campaignId: "c1",
        campaignLeadId: "cl1",
        stepPosition: 1,
        sentAt: "2026-11-06T12:00:00.000Z",
        steps: steps.map((s) => ({ id: `st${s.position}`, campaignId: "c1", type: "follow_up" as const, ...s })),
      });
      const q = dialect.sqlToQuery(wheres[0]!);
      expect(q.sql).toMatch(/"campaign_leads"\."id" = \$1 and "campaign_leads"\."status" = \$2/);
      expect(q.params).toEqual(["cl1", "scheduled"]);
    }
  });

  it("does not requeue when a reply or cancel already changed the lead (0 rows updated)", async () => {
    const { db, writes } = stateDb({ campaignLead: "replied", lead: "replied" }, TWO_STEPS);
    const out = await advanceSequenceAfterSend(db, {
      campaignId: "c1",
      campaignLeadId: "cl1",
      stepPosition: 1,
      sentAt: "2026-11-06T12:00:00.000Z",
      steps: TWO_STEPS.map((s) => ({ id: `st${s.position}`, campaignId: "c1", type: "follow_up" as const, ...s })),
    });
    expect(out).toBe("completed");
    expect(writes.filter((w) => w.applied && w.table === schema.campaignLeads)).toEqual([]);
  });
});

describe("processJob: a reply that lands mid-send wins", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    env.APP_URL = "https://autogtm.example";
    transport.sendMail.mockReset();
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("live send: the job is sent, but the lead stays 'replied' and no follow-up is queued", async () => {
    delete env.ENGINE_DRY_RUN;
    const state: State = { campaignLead: "scheduled", lead: "new" };
    const { db, writes } = stateDb(state, TWO_STEPS);
    transport.sendMail.mockImplementation(async () => {
      // Reply sync runs while SMTP is in flight.
      state.campaignLead = "replied";
      state.lead = "replied";
      return { messageId: "<m-race@pool.example>" };
    });
    expect(await processJob(db, job())).toBe("sent");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(state).toEqual({ campaignLead: "replied", lead: "replied" });
    // The email really went out, so the job is still recorded as sent.
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "sent")).toBe(true);
    expect(writes.some((w) => w.applied && w.table === schema.campaignLeads && w.set?.status === "queued")).toBe(false);
  });

  it("live send without a race still advances the sequence and marks the lead contacted", async () => {
    delete env.ENGINE_DRY_RUN;
    const state: State = { campaignLead: "scheduled", lead: "new" };
    const { db } = stateDb(state, TWO_STEPS);
    transport.sendMail.mockResolvedValue({ messageId: "<m-ok@pool.example>" });
    expect(await processJob(db, job({ id: "job-ok" }))).toBe("sent");
    expect(state).toEqual({ campaignLead: "queued", lead: "contacted" });
  });

  it("never downgrades a funnel status like 'interested'", async () => {
    delete env.ENGINE_DRY_RUN;
    const state: State = { campaignLead: "scheduled", lead: "new" };
    const { db } = stateDb(state, [{ position: 1, delayDays: 0 }]);
    transport.sendMail.mockImplementation(async () => {
      state.lead = "interested";
      return { messageId: "<m-funnel@pool.example>" };
    });
    expect(await processJob(db, job({ id: "job-funnel" }))).toBe("sent");
    expect(state.lead).toBe("interested");
    expect(state.campaignLead).toBe("sent");
  });

  it("dry run applies the same guards", async () => {
    env.ENGINE_DRY_RUN = "1";
    // The campaign does not stop on reply, so the send-time check lets the job
    // through; the bookkeeping still must not overwrite the reply.
    const state: State = { campaignLead: "replied", lead: "replied" };
    const { db, writes } = stateDb(state, TWO_STEPS);
    expect(await processJob(db, job({ id: "job-dry", dryRun: true }))).toBe("sent");
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(state).toEqual({ campaignLead: "replied", lead: "replied" });
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "sent")).toBe(true);
  });
});

/**
 * #72: the sender identity (company name, postal address) belongs to the
 * campaign's workspace, not to the account. #80: the AI model is managed;
 * stored per-user keys are ignored.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import { processJob } from "../processor";
import { MISSING_POSTAL_ADDRESS_NOTE, scheduleCampaign } from "../scheduler";
import { loadEngineAiOptions, systemAiOptions } from "../ai-options";
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
type Route = any[] | ((params: unknown[]) => any[]);

/** Selects resolve by table (a route may look at the WHERE params); writes are recorded. */
function fakeDb(routes: Map<unknown, Route>) {
  const writes: Write[] = [];
  const reads: unknown[] = [];
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
      let where: any;
      return chain(
        () => {
          const r = routes.get(table);
          if (typeof r === "function") return r(where ? dialect.sqlToQuery(where).params : []);
          return r ?? [];
        },
        (prop, args) => {
          if (prop === "from") (table = args[0]), reads.push(args[0]);
          if (prop === "where") where = args[0];
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
  return { db, writes, reads };
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

/** The owner's two workspaces; a lookup by id only returns that one. */
const WORKSPACES = [
  { id: "wA", workspaceName: "Client A", isDefault: true, companyName: "Acme Corp", postalAddress: "1 Main St, Springfield, IL 62701" },
  { id: "wB", workspaceName: "Client B", isDefault: false, companyName: "Bolt Labs", postalAddress: "9 Side Rd, Shelbyville, IL 62565" },
];
const byId = (blankB = false) => (params: unknown[]) =>
  WORKSPACES.filter((w) => params.includes(w.id)).map((w) => (blankB && w.id === "wB" ? { ...w, postalAddress: "" } : w));
const LEGACY_ROW = [{ companyName: "Legacy Account Inc", postalAddress: "5 Old Rd, Ogdenville" }];

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

function processRoutes(workspaces: Route) {
  return new Map<unknown, Route>([
    [schema.senderAccounts, [{ id: "s1", userId: "admin", email: "alex@pool.example", status: "active", dailyLimit: 30 }]],
    [
      schema.campaigns,
      [
        {
          id: "c1",
          userId: "u1",
          workspaceId: "wB",
          name: "C1",
          status: "running",
          deletedAt: null,
          dailyLimit: 50,
          maxEmailsPerSenderPerDay: 30,
          retryFailed: true,
          trackOpens: false,
          stopOnReply: true,
          sendingTimezone: "UTC",
          sendingWindowStart: "00:00",
          sendingWindowEnd: "23:59",
          businessDaysOnly: false,
        },
      ],
    ],
    [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
    [schema.leads, [{ id: "l1", userId: "u1", status: "contacted", email: "lee@acme-example.com" }]],
    [schema.suppressions, []],
    [schema.workspaces, workspaces],
    [schema.workspaceSettings, LEGACY_ROW],
    [schema.usageCounters, []],
    [schema.sequenceSteps, []],
    [schema.emailJobs, []],
  ]);
}

describe("processor footer uses the campaign's workspace", () => {
  it("a campaign in workspace B is signed with B's company and postal address", async () => {
    const { db, reads } = fakeDb(processRoutes(byId()));
    expect(await processJob(db, job(), NOW)).toBe("sent");
    const mail = transport.sendMail.mock.calls[0]?.[0];
    expect(mail.text).toContain("Bolt Labs");
    expect(mail.text).toContain("9 Side Rd, Shelbyville, IL 62565");
    expect(mail.text).not.toContain("Acme Corp");
    expect(mail.text).not.toContain("Legacy Account Inc");
    // The legacy account row is not consulted when the workspace exists.
    expect(reads).not.toContain(schema.workspaceSettings);
  });

  it("holds the job when the campaign's workspace has no postal address, even though the account row has one", async () => {
    const { db, writes } = fakeDb(processRoutes(byId(true)));
    expect(await processJob(db, job(), NOW)).toBe("held");
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "pending")).toBe(true);
  });

  it("holds the job when the campaign's workspace can't be found (never borrows another workspace's footer)", async () => {
    const { db } = fakeDb(processRoutes(() => []));
    expect(await processJob(db, job(), NOW)).toBe("held");
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});

describe("scheduler postal gate uses the campaign's workspace", () => {
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
  const campaign: any = {
    id: "c1",
    userId: "u1",
    workspaceId: "wB",
    name: "Spring push",
    status: "running",
    leadListId: "list1",
    templateId: "t1",
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "00:00",
    sendingWindowEnd: "23:59",
    dailyLimit: 50,
  };

  it("holds with the missing-postal-address note when B's address is blank, despite the legacy row", async () => {
    const { db } = fakeDb(
      new Map<unknown, Route>([
        [schema.usageCounters, []],
        [schema.sequenceSteps, []],
        [schema.workspaces, byId(true)],
        [schema.workspaceSettings, LEGACY_ROW],
        [schema.activityLogs, []],
      ]),
    );
    const r = await scheduleCampaign(db, campaign, NOW, { senders: [sender] });
    expect(r.note).toBe(MISSING_POSTAL_ADDRESS_NOTE);
  });

  it("passes the gate when B has an address", async () => {
    const { db } = fakeDb(
      new Map<unknown, Route>([
        [schema.usageCounters, []],
        [schema.sequenceSteps, []],
        [schema.workspaces, byId()],
        [schema.workspaceSettings, []],
        [schema.campaignLeads, []],
        [schema.activityLogs, []],
      ]),
    );
    const r = await scheduleCampaign(db, campaign, NOW, { senders: [sender] });
    expect(r.note).not.toBe(MISSING_POSTAL_ADDRESS_NOTE);
  });
});

describe("loadEngineAiOptions (#80)", () => {
  it("ignores a stored key and model and returns the managed options, without reading the db", async () => {
    const { db, reads } = fakeDb(
      new Map<unknown, Route>([
        [schema.workspaceSettings, [{ aiApiKeyEnc: "enc:v1:secret", aiProvider: "openai", aiModel: "gpt-4o" }]],
      ]),
    );
    expect(await loadEngineAiOptions(db, "u1")).toEqual(systemAiOptions());
    expect(reads).toHaveLength(0);
  });
});

/**
 * #30/#36 regression: queued rows of people who replied are never claimed
 * when Stop on reply is on (notExistsReplied). The scheduler cancels them
 * when nothing else is claimable, so the campaign can reach 'completed'.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import { REPLIED_QUEUED_CANCEL_REASON, scheduleCampaign } from "../scheduler";
import type { SenderRow } from "../db-port";

vi.mock("../mailer", () => ({ makeTransport: vi.fn(), sendMail: vi.fn(), verifySmtp: vi.fn(), makeImapClient: vi.fn() }));

const dialect = new PgDialect();
const NOW = new Date("2026-11-06T12:00:00.000Z");

type Write = { op: string; table: unknown; set?: any; where?: string };

/**
 * One queued campaign_lead whose person replied. The claim select never
 * returns it; pendingWork counts it until a cancel of queued rows of replied
 * people has run.
 */
function fakeDb() {
  const writes: Write[] = [];
  let swept = false;
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
  const routes = new Map<unknown, any[]>([
    [schema.usageCounters, []],
    [schema.sequenceSteps, [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0 }]],
    [
      schema.sequenceStepVariants,
      [{ id: "v1", stepId: "st1", label: "A", subject: "Hi", bodyText: "Hello", bodyHtml: "", aiGenerateOnTheFly: false }],
    ],
    [schema.workspaceSettings, [{ postalAddress: "1 Main St, Springfield", unsubscribeBaseUrl: "" }]],
    [schema.leads, []],
    [schema.suppressions, []],
    [schema.emailJobs, []],
  ]);
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let table: unknown;
      return chain(
        () => {
          if (table === schema.campaignLeads) {
            // pendingWork: count(*) of queued/scheduled rows.
            if (fields && "n" in fields) return [{ n: swept ? 0 : 1 }];
            return []; // claim: the replied row is filtered out
          }
          return routes.get(table) ?? [];
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
      return chain(
        () => [{ id: "row" }],
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "where") {
            entry.where = dialect.sqlToQuery(args[0]).sql.replace(/\s+/g, " ");
            if (
              table === schema.campaignLeads &&
              entry.set?.status === "cancelled" &&
              entry.where.includes("EXISTS (SELECT 1 FROM leads l")
            ) {
              swept = true;
            }
          }
        },
      );
    };
  }
  return { db, writes };
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

const env = process.env as Record<string, string | undefined>;
const saved = { approval: env.SIGNUP_APPROVAL_REQUIRED, appUrl: env.APP_URL };
beforeEach(() => {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  env.APP_URL = "https://autogtm.example";
});
afterEach(() => {
  if (saved.approval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = saved.approval;
  if (saved.appUrl === undefined) delete env.APP_URL;
  else env.APP_URL = saved.appUrl;
});

describe("scheduleCampaign: queued rows of people who replied", () => {
  it("cancels them when Stop on reply is on, so the campaign completes", async () => {
    const { db, writes } = fakeDb();
    const out = await scheduleCampaign(db, campaign(true), NOW, { senders: [sender] });
    expect(out.note).toBe("completed");
    const cancel = writes.find((w) => w.table === schema.campaignLeads && w.set?.status === "cancelled");
    expect(cancel?.set.lastError).toBe(REPLIED_QUEUED_CANCEL_REASON);
    // Only this campaign's queued rows of replied people, never scheduled/sent rows.
    expect(cancel?.where).toContain('"campaign_leads"."campaign_id" = $');
    expect(cancel?.where).toContain('"campaign_leads"."status" = $');
    expect(cancel?.where).toContain(
      "EXISTS (SELECT 1 FROM leads l WHERE l.id = campaign_leads.lead_id AND l.status IN ('replied','interested','meeting_booked','won','lost'))",
    );
    expect(cancel?.where).not.toContain("NOT EXISTS");
    expect(writes.some((w) => w.table === schema.campaigns && w.set?.status === "completed")).toBe(true);
  });

  it("leaves them queued when Stop on reply is off (they are claimable then)", async () => {
    const { db, writes } = fakeDb();
    const out = await scheduleCampaign(db, campaign(false), NOW, { senders: [sender] });
    expect(out.note).toBe("waiting-retry");
    expect(writes.some((w) => w.table === schema.campaignLeads && w.set?.status === "cancelled")).toBe(false);
    expect(writes.some((w) => w.table === schema.campaigns && w.set?.status === "completed")).toBe(false);
  });
});

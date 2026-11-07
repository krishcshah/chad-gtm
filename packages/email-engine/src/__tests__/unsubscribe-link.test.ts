/**
 * #79: the {{unsubscribe_url}} template variable always links to AutoGTM's
 * unsubscribe page. A legacy workspace_settings.unsubscribe_base_url is
 * ignored, so every opt-out is recorded and suppressed across campaigns.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { schema, verifyUnsubscribeToken } from "@smartreach/database";
import { scheduleCampaign } from "../scheduler";
import type { SenderRow } from "../db-port";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), verifySmtp: vi.fn() }));

const NOW = new Date("2026-11-06T12:00:00.000Z");

type Write = { op: string; table: unknown; set?: any; values?: any };

/** Selects resolve by table; writes are recorded. */
function tableDb(routes: Map<unknown, any[]>, writeResult: (w: Write) => any[]) {
  const writes: Write[] = [];
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
  name: "Opt-out link",
  status: "running",
  leadListId: "list1",
  templateId: null,
  businessDaysOnly: false,
  sendingTimezone: "UTC",
  sendingWindowStart: "00:00",
  sendingWindowEnd: "23:59",
  dailyLimit: 50,
  minDelaySec: 60,
  maxDelaySec: 120,
  maxEmailsPerSenderPerDay: 30,
  stopOnReply: false,
  retryFailed: false,
  retryCount: 0,
  lastSenderIdx: 0,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("scheduleCampaign: {{unsubscribe_url}}", () => {
  it("ignores a legacy custom unsubscribe base and links to AutoGTM", async () => {
    vi.stubEnv("APP_URL", "https://autogtm.tech");
    const routes = new Map<unknown, any[]>([
      [schema.usageCounters, []],
      [schema.sequenceSteps, [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0 }]],
      [
        schema.sequenceStepVariants,
        [
          {
            id: "v1",
            stepId: "st1",
            label: "A",
            subject: "Hi",
            bodyText: "Hello there.\n\nOpt out: {{unsubscribe_url}}",
            bodyHtml: "",
            aiGenerateOnTheFly: false,
          },
        ],
      ],
      [
        schema.workspaceSettings,
        [{ postalAddress: "1 Main St, Springfield", unsubscribeBaseUrl: "https://optout.client.example" }],
      ],
      [schema.campaignLeads, [{ id: "cl1", leadId: "l1", stepPosition: 1 }]],
      [schema.leads, [{ id: "l1", email: "lee@acme-example.com", firstName: "Lee" }]],
      [schema.suppressions, []],
      [schema.emailJobs, []],
    ]);
    const { db, writes } = tableDb(routes, (w) =>
      w.op === "update" && w.table === schema.campaignLeads && w.set?.status === "scheduled"
        ? [{ id: "cl1" }]
        : [{ id: "row" }],
    );

    const r = await scheduleCampaign(db, campaign, NOW, { senders: [sender] });
    expect(r.enqueued).toBe(1);
    const job = writes.find((w) => w.op === "insert" && w.table === schema.emailJobs)?.values;
    expect(job).toBeTruthy();
    expect(job.bodyText).not.toContain("optout.client.example");
    expect(job.bodyText).not.toContain("{{unsubscribe_url}}");
    const link = /https:\/\/autogtm\.tech\/unsubscribe\?token=(\S+)/.exec(job.bodyText);
    expect(link).not.toBeNull();
    // The token is one AutoGTM can verify, for this owner and recipient.
    expect(verifyUnsubscribeToken(decodeURIComponent(link![1]!))).toEqual({
      ok: true,
      userId: "u1",
      email: "lee@acme-example.com",
    });
  });
});

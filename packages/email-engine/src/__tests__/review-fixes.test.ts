/**
 * Regression tests for review findings on the sending engine:
 * pool fallback, owner approval in the reply agent, fair-share + sticky
 * follow-ups, SMTP/DSN bounce classification, double-send protection,
 * reminder digests and the missing-postal-address note.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";
import {
  campaignSenders,
  CAMPAIGN_BLOCKED_LOG_TYPE,
  MISSING_POSTAL_ADDRESS_NOTE,
  noteCampaignBlocked,
  onlyRetiredPoolSenders,
  poolFallbackAllowed,
  scheduleCampaign,
} from "../scheduler";
import { allocatePoolCapacity, withinPoolShare } from "../pool-allocation";
import { classifySmtpError, failureBlamesSender, isDeadAddress } from "../smtp-errors";
import { parseDsn, parseHeaderBlock } from "../inbound-classify";
import { handleDsn } from "../sync-replies";
import { processJob, processTick, unrecordedSendIds } from "../processor";
import {
  AGENT_OWNER_NOT_APPROVED_SUMMARY,
  AGENT_REMINDER_DIGEST_TYPE,
  AGENT_REMINDERS_MARKER_ID,
  composeReminderDigest,
  needsRenotify,
  replyAgentTick,
  resetRemindersSinceCache,
} from "../reply-agent";
import type { SenderRow } from "../db-port";
import {
  eximPlainSpamNoCode,
  gmailHardBounce,
  gmailSpamBlock,
  mailboxFull,
  outlookUnauthenticated,
} from "./fixtures/dsn";

vi.mock("../mailer", () => ({
  makeTransport: () => transport,
  sendMail: vi.fn(),
  makeImapClient: vi.fn(),
}));
vi.mock("../system-mailer", () => ({
  isSystemMailerConfigured: () => true,
  sendSystemEmail: systemSend,
}));

const { transport, systemSend } = vi.hoisted(() => ({
  transport: { sendMail: vi.fn(), close: vi.fn() },
  systemSend: vi.fn(),
}));

/* ─── Fake Drizzle client ───────────────────────────────────────────────── */

type Handler = any[] | ((call: number) => any[]);

/**
 * Selects resolve by the table passed to .from() (a handler may vary by call
 * number); every update/insert/delete is recorded with its set/values.
 * `failWrites` makes writes to a table throw (to simulate a DB outage).
 */
function tableDb(routes: Map<unknown, Handler>, opts: { failWrites?: (table: unknown, n: number) => boolean } = {}) {
  const selects: unknown[] = [];
  const writes: { op: "update" | "insert" | "delete"; table: unknown; set?: any; values?: any }[] = [];
  const counts = new Map<unknown, number>();
  const writeCounts = new Map<unknown, number>();
  const thenable = (resolve: () => any, onCall?: (prop: string, args: any[]) => void): any => {
    const proxy: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const p = Promise.resolve().then(resolve);
            return p.then.bind(p);
          }
          if (prop === "catch") {
            const p = Promise.resolve().then(resolve);
            return p.catch.bind(p);
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
          if (prop === "from") {
            table = args[0];
            selects.push(table);
          }
        },
      );
    },
  };
  for (const op of ["update", "insert", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: (typeof writes)[number] = { op, table };
      writes.push(entry);
      const n = writeCounts.get(table) ?? 0;
      writeCounts.set(table, n + 1);
      return thenable(
        () => {
          if (opts.failWrites?.(table, n)) throw new Error("db write failed: connection lost");
          return [{ id: "row" }];
        },
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
        },
      );
    };
  }
  return { db, selects, writes };
}

function sender(over: Record<string, unknown> = {}): SenderRow {
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
    imapHost: "",
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
    ...over,
  } as unknown as SenderRow;
}

const env = process.env as Record<string, string | undefined>;
const savedApproval = env.SIGNUP_APPROVAL_REQUIRED;
const savedAppUrl = env.APP_URL;
afterEach(() => {
  if (savedApproval === undefined) delete env.SIGNUP_APPROVAL_REQUIRED;
  else env.SIGNUP_APPROVAL_REQUIRED = savedApproval;
  if (savedAppUrl === undefined) delete env.APP_URL;
  else env.APP_URL = savedAppUrl;
});

const NOW = new Date("2026-11-06T12:00:00.000Z");

/** A running campaign whose lead conversations are handled by the agent. */
const AGENT_CAMPAIGN = {
  id: "c1",
  userId: "u1",
  workspaceId: null,
  status: "running",
  deletedAt: null,
  leadConversationMode: "agent",
  agentOffer: "",
};

/* ─── Finding 1: pool fallback ──────────────────────────────────────────── */

describe("campaignSenders pool fallback", () => {
  // Keyed on the campaign's own status (#46), not run.status.
  const activeRun = { campaignStatus: "running", runUserId: "u1", campaignUserId: "u1" };

  it("is allowed only for a running autopilot campaign of the same owner", () => {
    expect(poolFallbackAllowed(undefined)).toBe(false); // manual campaign
    expect(poolFallbackAllowed(null)).toBe(false); // missing run
    expect(poolFallbackAllowed(activeRun)).toBe(true);
    expect(poolFallbackAllowed({ ...activeRun, campaignStatus: "paused" })).toBe(false);
    expect(poolFallbackAllowed({ ...activeRun, campaignStatus: "completed" })).toBe(false);
    expect(poolFallbackAllowed({ ...activeRun, campaignStatus: "archived" })).toBe(false);
    expect(poolFallbackAllowed({ ...activeRun, campaignUserId: "someone-else" })).toBe(false);
  });

  it("needs retired pool mailboxes still attached; nothing attached never falls back", () => {
    expect(onlyRetiredPoolSenders([])).toBe(false);
    expect(onlyRetiredPoolSenders([sender({ deletedAt: "2026-11-01" })])).toBe(true);
    expect(onlyRetiredPoolSenders([sender({ deletedAt: "2026-11-01", isSystemPool: false })])).toBe(false);
    expect(onlyRetiredPoolSenders([sender({ deletedAt: null })])).toBe(false);
  });

  it("an autopilot campaign whose senders were detached gets no senders (not the whole pool)", async () => {
    const pool = [sender({ id: "p1" }), sender({ id: "p2" })];
    const { db, selects } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, []], // user detached every sender
        [schema.chadGtmRuns, [activeRun]],
        [schema.senderAccounts, pool],
      ]),
    );
    expect(await campaignSenders(db, "c1")).toEqual([]);
    expect(selects).not.toContain(schema.senderAccounts);
  });

  it("a manual campaign with retired pool mailboxes gets no senders", async () => {
    const { db } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: sender({ id: "old", deletedAt: "2026-11-01" }) }]],
        [schema.chadGtmRuns, []],
        [schema.senderAccounts, [sender({ id: "p1" })]],
      ]),
    );
    expect(await campaignSenders(db, "c1")).toEqual([]);
  });

  it("an active autopilot campaign whose pool mailboxes were retired uses the current pool", async () => {
    const pool = [sender({ id: "p1" })];
    const { db } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: sender({ id: "old", deletedAt: "2026-11-01" }) }]],
        [schema.chadGtmRuns, [activeRun]],
        [schema.senderAccounts, pool],
      ]),
    );
    expect(await campaignSenders(db, "c1")).toEqual(pool);
  });

  it("a paused campaign never falls back", async () => {
    const { db } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: sender({ id: "old", deletedAt: "2026-11-01" }) }]],
        [schema.chadGtmRuns, [{ ...activeRun, campaignStatus: "paused" }]],
        [schema.senderAccounts, [sender({ id: "p1" })]],
      ]),
    );
    expect(await campaignSenders(db, "c1")).toEqual([]);
  });

  it("an active autopilot campaign also gets pool mailboxes imported after launch", async () => {
    const p1 = sender({ id: "p1", createdAt: "2026-11-01T00:00:00.000Z" });
    const p2 = sender({ id: "p2", createdAt: "2026-11-05T00:00:00.000Z" });
    const { db } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: p1 }]],
        [schema.chadGtmRuns, [activeRun]],
        [schema.senderAccounts, [p1, p2]],
      ]),
    );
    expect((await campaignSenders(db, "c1")).map((s) => s.id)).toEqual(["p1", "p2"]);
  });

  it("keeps sending from the live pool when every attached pool mailbox is paused", async () => {
    const p1 = sender({ id: "p1", status: "paused", createdAt: "2026-11-01T00:00:00.000Z" });
    const p2 = sender({ id: "p2", status: "active", createdAt: "2026-11-05T00:00:00.000Z" });
    const p3 = sender({ id: "p3", status: "failed", createdAt: "2026-11-06T00:00:00.000Z" });
    const { db } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: p1 }]],
        [schema.chadGtmRuns, [activeRun]],
        [schema.senderAccounts, [p1, p2, p3]],
      ]),
    );
    const senders = await campaignSenders(db, "c1");
    // Paused/failed rows stay listed so a sticky follow-up can find its step-1 mailbox and defer.
    expect(senders.map((s) => s.id)).toEqual(["p1", "p2", "p3"]);
    expect(senders.filter((s) => s.status === "active").map((s) => s.id)).toEqual(["p2"]);
  });

  it("does not list a retired mailbox, so its follow-ups rotate to the live pool", async () => {
    const old = sender({ id: "old", deletedAt: "2026-11-02", createdAt: "2026-11-01T00:00:00.000Z" });
    const p2 = sender({ id: "p2", createdAt: "2026-11-05T00:00:00.000Z" });
    const { db } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: old }, { sender: p2 }]],
        [schema.chadGtmRuns, [activeRun]],
        [schema.senderAccounts, [p2]],
      ]),
    );
    expect((await campaignSenders(db, "c1")).map((s) => s.id)).toEqual(["p2"]);
  });

  it("a manual campaign or a paused campaign with attached pool mailboxes gets only its attached rows", async () => {
    const p1 = sender({ id: "p1" });
    const p2 = sender({ id: "p2" });
    for (const runRows of [[], [{ ...activeRun, campaignStatus: "paused" }], [{ ...activeRun, campaignUserId: "u2" }]]) {
      const { db } = tableDb(
        new Map<unknown, Handler>([
          [schema.campaignSenders, [{ sender: p1 }]],
          [schema.chadGtmRuns, runRows],
          [schema.senderAccounts, [p1, p2]],
        ]),
      );
      expect((await campaignSenders(db, "c1")).map((s) => s.id)).toEqual(["p1"]);
    }
  });

  it("a campaign on its own (non-pool) mailboxes never reads the pool", async () => {
    const own = sender({ id: "own", isSystemPool: false, userId: "u1" });
    const { db, selects } = tableDb(
      new Map<unknown, Handler>([
        [schema.campaignSenders, [{ sender: own }]],
        [schema.chadGtmRuns, [activeRun]],
        [schema.senderAccounts, [sender({ id: "p1" })]],
      ]),
    );
    expect((await campaignSenders(db, "c1")).map((s) => s.id)).toEqual(["own"]);
    expect(selects).not.toContain(schema.senderAccounts);
    expect(selects).not.toContain(schema.chadGtmRuns);
  });
});

/* ─── Finding 2: reply agent and owner approval ─────────────────────────── */

describe("reply agent never sends for an owner who is not approved", () => {
  it("holds the reply ('held', not Needs you, no email) when the owner's approval was revoked", async () => {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    const sendMail = vi.fn();
    const reply = {
      id: "r1",
      userId: "u1",
      senderId: "s1",
      campaignId: "c1",
      leadId: null,
      fromEmail: "dana@acme-example.com",
      subject: "Re: idea",
      bodyText: "Sure, send me your calendar link",
    };
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.agentRequests, []],
        [schema.replies, (n) => (n === 0 ? [{ id: "r1", agentAttempts: 0 }] : [reply])],
        [schema.chadGtmRuns, [{ id: "run1", userId: "u1", replyAgentMode: "autopilot", bookingUrl: "https://cal.example/x" }]],
        [schema.campaigns, [AGENT_CAMPAIGN]],
        [schema.leadConversations, []],
        [schema.senderAccounts, [sender()]],
        [schema.uniboxMessages, []],
        [schema.users, [{ id: "u1", role: "user", approvedAt: null }]],
        [schema.engineHeartbeats, [{ lastTickAt: NOW.toISOString() }]],
      ]),
    );
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail });
    expect(sendMail).not.toHaveBeenCalled();
    expect(r.held).toBe(1);
    expect(r.escalated).toBe(0);
    const fin = writes.find((w) => w.table === schema.replies && w.set?.agentStatus === "held");
    expect(fin?.set.agentSummary).toBe(AGENT_OWNER_NOT_APPROVED_SUMMARY);
    // Account on hold: no Needs you card (it opens once the account is approved).
    expect(writes.some((w) => w.op === "insert" && w.table === schema.agentRequests)).toBe(false);
    expect(r.released).toBe(0);
  });
});

/* ─── Finding 8: fair share spreads over mailboxes; sticky follow-ups go ── */

describe("pool fair share and sticky follow-ups", () => {
  it("spreads a small campaign's share across every mailbox it uses", () => {
    const a = allocatePoolCapacity(
      [
        { id: "A", capacity: 30 },
        { id: "B", capacity: 30 },
        { id: "C", capacity: 30 },
      ],
      [{ id: "c1", userId: "u1", senderIds: ["A", "B", "C"], demand: 12 }],
    );
    expect(a.get("c1")).toEqual(new Map([["A", 4], ["B", 4], ["C", 4]]));
    const plan = { quota: a.get("c1")!, used: new Map<string, number>() };
    expect(withinPoolShare(plan, sender({ id: "C" }))).toBe(true);
  });

  it("a follow-up sticky to a mailbox with no fair share left still goes from it", async () => {
    const senders = ["A", "B", "C"].map((id) => sender({ id, email: `${id.toLowerCase()}@pool.example` }));
    const campaign: any = {
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
      minDelaySec: 60,
      maxDelaySec: 90,
      maxEmailsPerSenderPerDay: 30,
      stopOnReply: false,
      retryFailed: true,
      retryCount: 3,
      lastSenderIdx: 0,
    };
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.usageCounters, []],
        [
          schema.sequenceSteps,
          [
            { id: "st1", campaignId: "c1", position: 1, delayDays: 0 },
            { id: "st2", campaignId: "c1", position: 2, delayDays: 3 },
          ],
        ],
        [schema.workspaceSettings, [{ postalAddress: "1 Main St, Springfield", unsubscribeBaseUrl: "" }]],
        [schema.campaignLeads, [{ id: "cl1", leadId: "l1", stepPosition: 2 }]],
        [schema.leads, [{ id: "l1", email: "lee@acme-example.com", firstName: "Lee" }]],
        [schema.suppressions, []],
        [schema.emailJobs, [{ campaignLeadId: "cl1", senderId: "C", stepPosition: 1 }]],
        [
          schema.sequenceStepVariants,
          [{ id: "v2", stepId: "st2", label: "A", subject: "Re: hi", bodyText: "Following up", bodyHtml: "", aiGenerateOnTheFly: false }],
        ],
      ]),
    );
    // The whole fair share sits on A (and is used up); C has none.
    const pool = { quota: new Map([["A", 12]]), used: new Map([["A", 12]]) };
    const r = await scheduleCampaign(db, campaign, NOW, { senders, pool });
    const job = writes.find((w) => w.op === "insert" && w.table === schema.emailJobs);
    expect(job?.values.senderId).toBe("C");
    expect(r.enqueued).toBe(1);
    expect(writes.some((w) => w.set?.lastError === "waiting-for-step-1-mailbox")).toBe(false);
    expect(pool.used.get("C")).toBe(1);
  });
});

/* ─── Finding 9: MAIL FROM / sender-side rejections ─────────────────────── */

describe("classifySmtpError: sender-side rejections are the mailbox's problem", () => {
  it("Gmail daily sending limit at MAIL FROM: temporary, never a recipient failure", () => {
    const f = classifySmtpError({
      code: "EENVELOPE",
      command: "MAIL FROM",
      responseCode: 550,
      response: "550-5.4.5 Daily user sending limit exceeded. For more information on Gmail sending limits",
    });
    expect(f).toMatchObject({ kind: "sender", permanent: false, hardBounce: false, senderQuota: true });
  });

  it("553 5.1.8 Sender address rejected: blames the mailbox, never a hard bounce", () => {
    const f = classifySmtpError({
      code: "EENVELOPE",
      command: "MAIL FROM",
      responseCode: 553,
      response: "553 5.1.8 <pool@domain.example>: Sender address rejected: Domain not found",
    });
    expect(f).toMatchObject({ kind: "sender", permanent: true, hardBounce: false });
    expect(failureBlamesSender(f)).toBe(true);
  });

  it("not-owned-by-user and relay denied blame the mailbox", () => {
    const notOwned = classifySmtpError({
      code: "EENVELOPE",
      command: "MAIL FROM",
      responseCode: 553,
      response: "553 5.7.1 <pool@domain.example>: Sender address rejected: not owned by user pool@other.example",
    });
    expect(notOwned).toMatchObject({ kind: "sender", hardBounce: false });
    expect(failureBlamesSender(notOwned)).toBe(true);
    const relay = classifySmtpError({ code: "EENVELOPE", command: "RCPT TO", responseCode: 554, response: "554 5.7.1 <x@y.com>: Relay access denied" });
    expect(relay).toMatchObject({ kind: "sender", hardBounce: false });
    expect(failureBlamesSender(relay)).toBe(true);
  });

  it("only dead-address statuses are hard bounces", () => {
    expect(isDeadAddress("5.1.1")).toBe(true);
    expect(isDeadAddress("5.1.10")).toBe(true);
    expect(isDeadAddress("5.2.1")).toBe(true);
    expect(isDeadAddress("5.1.8", "Sender address rejected")).toBe(false);
    expect(isDeadAddress("5.7.26", "user unknown")).toBe(false);
    expect(isDeadAddress("5.2.2", "Mailbox full")).toBe(false);
    expect(isDeadAddress("5.0.0", "550 User unknown")).toBe(true);
    expect(isDeadAddress("5.0.0", "Message rejected as spam")).toBe(false);
    expect(isDeadAddress("5.0.0", "")).toBe(false);
  });

  it("processor: a sender-quota rejection holds the job and never fails the lead", async () => {
    transport.sendMail.mockRejectedValueOnce(
      Object.assign(new Error("550-5.4.5 Daily user sending limit exceeded"), {
        code: "EENVELOPE",
        command: "MAIL FROM",
        responseCode: 550,
        response: "550-5.4.5 Daily user sending limit exceeded",
      }),
    );
    const { db, writes } = processorDb();
    const outcome = await processJob(db, baseJob());
    expect(outcome).toBe("held");
    expect(writes.some((w) => w.table === schema.campaignLeads && w.set?.status === "failed")).toBe(false);
    expect(writes.some((w) => w.table === schema.suppressions)).toBe(false);
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "failed")).toBe(false);
  });

  it("processor: a permanent sender rejection fails the MAILBOX and hands the lead back", async () => {
    transport.sendMail.mockRejectedValueOnce(
      Object.assign(new Error("553 5.1.8 Sender address rejected: Domain not found"), {
        code: "EENVELOPE",
        command: "MAIL FROM",
        responseCode: 553,
        response: "553 5.1.8 <pool@domain.example>: Sender address rejected: Domain not found",
      }),
    );
    const { db, writes } = processorDb();
    const outcome = await processJob(db, baseJob());
    expect(outcome).toBe("skipped");
    const mailbox = writes.find((w) => w.table === schema.senderAccounts && w.op === "update");
    expect(mailbox?.set).toMatchObject({ status: "failed", smtpStatus: "failed" });
    expect(writes.some((w) => w.op === "delete" && w.table === schema.emailJobs)).toBe(true); // released
    expect(writes.some((w) => w.table === schema.suppressions)).toBe(false);
    expect(writes.some((w) => w.table === schema.leads && w.set?.status === "bounced")).toBe(false);
  });
});

/* ─── Finding 10: DSN 5.7.x / 5.2.2 are not global hard bounces ─────────── */

function dsn(f: { fromEmail: string; subject: string; headers: string; body: string }) {
  return parseDsn({ fromEmail: f.fromEmail, subject: f.subject, headers: parseHeaderBlock(f.headers), body: f.body })!;
}

describe("DSN classification", () => {
  it("5.1.1 is a hard bounce", () => {
    expect(dsn(gmailHardBounce).recipients[0]).toMatchObject({ permanent: true, hardBounce: true, policy: false });
  });
  it("5.7.26 unauthenticated is permanent but not a hard bounce, and is a policy block", () => {
    expect(dsn(outlookUnauthenticated).recipients[0]).toMatchObject({
      email: "lee@fabrikam-example.com",
      status: "5.7.26",
      permanent: true,
      hardBounce: false,
      policy: true,
    });
  });
  it("5.7.1 spam block is not a hard bounce", () => {
    expect(dsn(gmailSpamBlock).recipients[0]).toMatchObject({ permanent: true, hardBounce: false, policy: true });
  });
  it("5.2.2 mailbox full is not a hard bounce", () => {
    expect(dsn(mailboxFull).recipients[0]).toMatchObject({ status: "5.2.2", permanent: true, hardBounce: false, policy: false });
  });
  it("a plain-text spam rejection without a code is not a hard bounce", () => {
    const r = dsn(eximPlainSpamNoCode).recipients[0]!;
    expect(r.email).toBe("ann@contoso-example.org");
    expect(r.hardBounce).toBe(false);
  });

  it("handleDsn: a 5.7.26 NDR stops the lead in that campaign, flags the mailbox, never suppresses", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.emailJobs, [{ id: "j1", leadId: "l1", campaignId: "c1", toEmail: "lee@fabrikam-example.com" }]],
        [schema.leads, [{ id: "l1", userId: "u1", workspaceId: null, status: "contacted" }]],
      ]),
    );
    const s = sender({ id: "s4", email: "kim@pool-four.example", userId: "admin" });
    const recorded = await handleDsn(db, s, {}, dsn(outlookUnauthenticated));
    expect(recorded).toBe(true);
    expect(writes.some((w) => w.table === schema.suppressions)).toBe(false);
    expect(writes.some((w) => w.table === schema.leads && w.set?.status === "bounced")).toBe(false);
    expect(writes.some((w) => w.table === schema.campaignLeads && w.set?.status === "failed")).toBe(true);
    const flag = writes.find((w) => w.op === "insert" && w.values?.type === "sender.policy_block");
    expect(flag?.values.meta).toMatchObject({ senderId: "s4", domain: "pool-four.example", status: "5.7.26" });
    expect(writes.some((w) => w.op === "update" && w.table === schema.senderAccounts)).toBe(true);
  });

  it("handleDsn: a 5.2.2 NDR does not suppress and does not flag the mailbox", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.emailJobs, [{ id: "j1", leadId: "l1", campaignId: "c1", toEmail: "pat@tailspin-example.com" }]],
        [schema.leads, [{ id: "l1", userId: "u1" }]],
      ]),
    );
    await handleDsn(db, sender(), {}, dsn(mailboxFull));
    expect(writes.some((w) => w.table === schema.suppressions)).toBe(false);
    expect(writes.some((w) => w.table === schema.senderAccounts)).toBe(false);
  });

  it("handleDsn: a 5.1.1 NDR still suppresses globally", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.emailJobs, [{ id: "j1", leadId: "l1", campaignId: "c1", toEmail: "nobody@acme-example.com" }]],
        [schema.leads, [{ id: "l1", userId: "u1", status: "contacted" }]],
      ]),
    );
    await handleDsn(db, sender(), {}, dsn(gmailHardBounce));
    expect(writes.some((w) => w.table === schema.suppressions && w.values?.source === "bounce")).toBe(true);
  });
});

/* ─── Finding 11: the reply agent never sends twice ─────────────────────── */

describe("reply agent: a failure after the send never re-sends", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function agentDb(failUnibox: boolean) {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    const reply = {
      id: "r1",
      userId: "u1",
      senderId: "s1",
      campaignId: "c1",
      leadId: null,
      fromEmail: "dana@acme-example.com",
      fromName: "Dana",
      subject: "Re: idea",
      bodyText: "Sounds interesting, can we set up a call next week?",
      receivedAt: "2026-11-06T11:00:00.000Z",
      messageId: "<in-1@acme-example.com>",
      // Claimed by this tick, so the pre-send ownership check passes.
      agentStatus: "processing",
      agentClaimedAt: NOW.toISOString(),
    };
    return tableDb(
      new Map<unknown, Handler>([
        [schema.replies, (n) => (n === 0 ? [{ id: "r1", agentAttempts: 0 }] : [reply])],
        [
          schema.chadGtmRuns,
          [
            {
              id: "run1",
              userId: "u1",
              replyAgentMode: "autopilot",
              bookingUrl: "https://cal.example/dana",
              companyName: "Acme",
              businessOverview: { summary: "Acme automates reporting for finance teams." },
              offers: [{ title: "Reporting audit", valueProp: "Find a week of reporting work to cut" }],
            },
          ],
        ],
        [schema.campaigns, [AGENT_CAMPAIGN]],
        [schema.leadConversations, []],
        [schema.senderAccounts, [sender()]],
        [schema.uniboxMessages, []],
        [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
        [schema.agentKnowledge, []],
        [schema.workspaceSettings, []],
        [schema.agentRequests, []],
        [schema.engineHeartbeats, [{ lastTickAt: NOW.toISOString() }]],
      ]),
      { failWrites: (table) => failUnibox && (table === schema.uniboxMessages || table === schema.activityLogs) },
    );
  }

  it("marks the reply replied right after SMTP accepts it, and a later DB error does not retry", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "<out-1@pool.example>" });
    const { db, writes } = agentDb(true);
    const triage = async () => ({ intent: "interested" as const, confidence: 0.9, summary: "wants a call", resourceRequests: [], questions: [] });
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail, triage: triage as any });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(r.replied).toBe(1);
    expect(r.retried).toBe(0);
    expect(writes.some((w) => w.table === schema.replies && w.set?.agentStatus === "pending")).toBe(false);
    expect(writes.some((w) => w.table === schema.replies && w.set?.agentStatus === "replied")).toBe(true);
  });

  it("legacy replies stuck in processing with no claim time are left for manual review", async () => {
    const sendMail = vi.fn();
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, (n) => (n === 0 ? [{ id: "old", agentAttempts: 0, agentClaimedAt: null }] : [])],
        [schema.engineHeartbeats, [{ lastTickAt: NOW.toISOString() }]],
      ]),
    );
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false, sendMail });
    expect(r.reclaimed).toBe(0);
    expect(writes.some((w) => w.table === schema.replies)).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("a stuck reply whose agent email was already recorded is marked replied, not retried", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.replies, (n) => (n === 0 ? [{ id: "r9", agentAttempts: 0, agentClaimedAt: "2026-11-06T11:00:00.000Z" }] : [])],
        [schema.uniboxMessages, [{ id: "u-msg" }]],
      ]),
    );
    const r = await replyAgentTick(db, { now: () => NOW, notifyClient: false });
    expect(r.reclaimed).toBe(1);
    expect(writes.find((w) => w.table === schema.replies)?.set).toMatchObject({ agentStatus: "replied" });
    expect(writes.some((w) => w.set?.agentStatus === "pending")).toBe(false);
  });
});

/* ─── Finding 12: reminders ─────────────────────────────────────────────── */

describe("reminder digests", () => {
  beforeEach(() => {
    systemSend.mockReset();
    systemSend.mockResolvedValue({ messageId: "sys" });
    resetRemindersSinceCache();
  });

  it("never reminds about requests created before reminders were enabled", () => {
    const req = { createdAt: "2026-09-01T00:00:00.000Z", notifiedAt: "2026-09-01T00:00:05.000Z" };
    expect(needsRenotify(req, NOW)).toBe(true);
    expect(needsRenotify(req, NOW, "2026-11-05T00:00:00.000Z")).toBe(false);
    expect(needsRenotify({ createdAt: "2026-11-05T06:00:00.000Z", notifiedAt: null }, NOW, "2026-11-05T00:00:00.000Z")).toBe(true);
  });

  it("composes one digest listing every request", () => {
    const d = composeReminderDigest(
      { name: "Dana Client" },
      [
        { title: "Case study", question: "Do you have one?", leadEmail: "a@x.com" },
        { title: "Pricing", question: "How much?", leadEmail: "b@x.com" },
      ],
      "https://autogtm.tech",
    );
    expect(d.subject).toBe("Reminder: 2 leads are waiting on you");
    expect(d.text).toContain("- Case study (a@x.com)");
    expect(d.text).toContain("- Pricing (b@x.com)");
    expect(d.text).toContain("https://autogtm.tech/requests");
  });

  function reminderDb(opts: { since: string; requests: any[]; recentDigest?: boolean; workspaces?: Handler }) {
    delete env.SIGNUP_APPROVAL_REQUIRED;
    return tableDb(
      new Map<unknown, Handler>([
        [schema.replies, []],
        [schema.engineHeartbeats, [{ lastTickAt: opts.since }]],
        [schema.agentRequests, opts.requests],
        [schema.users, (n) => (n === 0 ? [{ id: "u1", role: "user", approvedAt: "2026-01-01" }] : [{ email: "client@acme.com", name: "Dana" }])],
        [schema.activityLogs, opts.recentDigest ? [{ id: "digest" }] : []],
        [schema.workspaces, opts.workspaces ?? []],
      ]),
    );
  }

  const req = (id: string, createdAt: string) => ({
    id,
    userId: "u1",
    status: "open",
    title: `Request ${id}`,
    question: "?",
    leadEmail: `${id}@lead.example`,
    replyId: null,
    createdAt,
    notifiedAt: createdAt,
  });

  it("sends ONE digest for several open requests of the same client and records it", async () => {
    const { db, writes } = reminderDb({
      since: "2026-11-01T00:00:00.000Z",
      requests: [req("q1", "2026-11-04T10:00:00.000Z"), req("q2", "2026-11-05T09:00:00.000Z")],
    });
    const r = await replyAgentTick(db, { now: () => NOW });
    expect(r.renotified).toBe(1);
    expect(systemSend).toHaveBeenCalledTimes(1);
    expect(systemSend.mock.calls[0][0].subject).toBe("Reminder: 2 leads are waiting on you");
    const log = writes.find((w) => w.op === "insert" && w.values?.type === AGENT_REMINDER_DIGEST_TYPE);
    expect(log?.values.meta.requestIds).toEqual(["q1", "q2"]);
    // The marker row is created once (insert … on conflict do nothing).
    expect(writes.some((w) => w.table === schema.engineHeartbeats && w.values?.id === AGENT_REMINDERS_MARKER_ID)).toBe(true);
  });

  it("does not send a second digest the same day", async () => {
    const { db } = reminderDb({
      since: "2026-11-01T00:00:00.000Z",
      requests: [req("q3", "2026-11-04T10:00:00.000Z")],
      recentDigest: true,
    });
    const r = await replyAgentTick(db, { now: () => NOW });
    expect(r.renotified).toBe(0);
    expect(systemSend).not.toHaveBeenCalled();
  });

  it("does not remind about requests from before the feature shipped (first deploy)", async () => {
    const { db } = reminderDb({
      since: "2026-11-06T11:59:00.000Z", // reminders enabled just now
      requests: [req("old1", "2026-08-01T10:00:00.000Z"), req("old2", "2026-10-01T10:00:00.000Z")],
    });
    const r = await replyAgentTick(db, { now: () => NOW });
    expect(r.renotified).toBe(0);
    expect(systemSend).not.toHaveBeenCalled();
  });

  it("sends no digest when the workspace turned the daily reminder off, and claims nothing", async () => {
    const { db, writes } = reminderDb({
      since: "2026-11-01T00:00:00.000Z",
      requests: [{ ...req("q4", "2026-11-04T10:00:00.000Z"), workspaceId: "w1" }],
      workspaces: [{ id: "w1", notifyEmail: "", notifyEscalations: true, notifyReminders: false }],
    });
    const r = await replyAgentTick(db, { now: () => NOW });
    expect(r.renotified).toBe(0);
    expect(systemSend).not.toHaveBeenCalled();
    expect(writes.some((w) => w.op === "update" && w.table === schema.agentRequests)).toBe(false);
  });

  it("sends the digest to the workspace's notify address", async () => {
    const { db } = reminderDb({
      since: "2026-11-01T00:00:00.000Z",
      requests: [{ ...req("q5", "2026-11-04T10:00:00.000Z"), workspaceId: "w1" }],
      workspaces: [{ id: "w1", notifyEmail: "sales@acme.com", notifyEscalations: true, notifyReminders: true }],
    });
    const r = await replyAgentTick(db, { now: () => NOW });
    expect(r.renotified).toBe(1);
    expect(systemSend).toHaveBeenCalledTimes(1);
    expect(systemSend.mock.calls[0][0].to).toBe("sales@acme.com");
  });
});

/* ─── Finding 13: processor never re-sends after a post-send DB error ───── */

function baseJob(over: Record<string, unknown> = {}): any {
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

function processorDb(failWrites?: (table: unknown, n: number) => boolean) {
  delete env.SIGNUP_APPROVAL_REQUIRED;
  env.APP_URL = "https://autogtm.example";
  return tableDb(
    new Map<unknown, Handler>([
      [schema.senderAccounts, [sender()]],
      [schema.campaigns, [
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
      ]],
      [schema.users, [{ id: "u1", role: "user", approvedAt: "2026-01-01" }]],
      [schema.leads, [{ id: "l1", userId: "u1", status: "new", email: "lee@acme-example.com" }]],
      [schema.suppressions, []],
      [schema.workspaceSettings, [{ companyName: "Acme", postalAddress: "1 Main St" }]],
      [schema.usageCounters, []],
      [schema.sequenceSteps, []],
      [schema.emailJobs, []],
    ]),
    { failWrites },
  );
}

describe("processor: post-send bookkeeping errors never re-send", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    transport.sendMail.mockReset();
  });
  afterEach(() => errSpy.mockRestore());

  it("a DB error after SMTP accepted the email is not a retry and the mailbox is not penalized", async () => {
    transport.sendMail.mockResolvedValue({ messageId: "<m1@pool.example>" });
    // reserveSendSlot's write succeeds; the 'sent' update on email_jobs fails.
    const { db, writes } = processorDb((table) => table === schema.emailJobs);
    const outcome = await processJob(db, baseJob());
    expect(outcome).toBe("sent");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "retry")).toBe(false);
    expect(writes.some((w) => w.table === schema.emailJobs && w.set?.status === "pending")).toBe(false);
    expect(writes.some((w) => w.table === schema.senderAccounts)).toBe(false);
    expect(unrecordedSendIds()).toContain("job-1");

    // The job comes back (e.g. stuck-job recovery): it is reconciled, not sent again.
    const healthy = processorDb();
    const again = await processJob(healthy.db, baseJob());
    expect(again).toBe("sent");
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(healthy.writes.some((w) => w.table === schema.emailJobs && w.set?.status === "sent")).toBe(true);
    expect(unrecordedSendIds()).not.toContain("job-1");
  });

  it("processTick reconciles delivered jobs before recovering stuck ones", async () => {
    transport.sendMail.mockResolvedValue({ messageId: "<m2@pool.example>" });
    const failing = processorDb((table) => table === schema.leads);
    expect(await processJob(failing.db, baseJob({ id: "job-2" }))).toBe("sent");
    expect(unrecordedSendIds()).toContain("job-2");
    const healthy = processorDb();
    await processTick(healthy.db, NOW);
    expect(unrecordedSendIds()).not.toContain("job-2");
    expect(healthy.writes.some((w) => w.table === schema.leads && w.set?.status === "contacted")).toBe(true);
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
  });
});

/* ─── Finding 14: missing postal address is recorded once a day ─────────── */

describe("missing postal address note", () => {
  const campaign: any = {
    id: "c1",
    userId: "u1",
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

  it("scheduleCampaign records a campaign_blocked activity row the UI can show", async () => {
    const { db, writes } = tableDb(
      new Map<unknown, Handler>([
        [schema.usageCounters, []],
        [schema.sequenceSteps, []],
        [schema.workspaceSettings, [{ postalAddress: "  " }]],
        [schema.activityLogs, []],
      ]),
    );
    const r = await scheduleCampaign(db, campaign, NOW, { senders: [sender()] });
    expect(r.note).toBe(MISSING_POSTAL_ADDRESS_NOTE);
    const row = writes.find((w) => w.op === "insert" && w.table === schema.activityLogs);
    expect(row?.values).toMatchObject({
      userId: "u1",
      campaignId: "c1",
      type: CAMPAIGN_BLOCKED_LOG_TYPE,
      meta: { reason: MISSING_POSTAL_ADDRESS_NOTE },
    });
    expect(row?.values.message).toContain("postal address");
  });

  it("writes at most one note per day", async () => {
    const { db, writes } = tableDb(new Map<unknown, Handler>([[schema.activityLogs, [{ id: "earlier-today" }]]]));
    expect(await noteCampaignBlocked(db, campaign, MISSING_POSTAL_ADDRESS_NOTE, "is not sending", NOW)).toBe(false);
    expect(writes).toHaveLength(0);
  });
});

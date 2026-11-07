import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* "Lead conversations" settings: the workspace default and the per-campaign
 * value. Agent needs grounding, only the owner can change a campaign, a run
 * mirrors its campaign, and mode changes touch waiting conversations only
 * when the person confirms (never sending anything themselves). */

type Write = { op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any; where?: any };

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const st = vi.hoisted(() => ({
  writes: [] as Write[],
  campaign: null as Record<string, any> | null,
  run: null as Record<string, any> | null,
  workspace: null as Record<string, any> | null,
  replies: [] as Array<Record<string, any>>,
  outbound: [] as Array<Record<string, any>>,
  handlers: [] as Array<Record<string, any>>,
  requests: [] as Array<Record<string, any>>,
  suppressions: [] as Array<Record<string, any>>,
  sendMail: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "owner@client.example", role: "user" })) }));
vi.mock("../workspaces", () => ({ getActiveWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })) }));
vi.mock("@smartreach/email-engine/mailer", () => ({ sendMail: st.sendMail }));
vi.mock("../db", () => {
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
  const has = (fields: string[], ...names: string[]) => names.every((n) => fields.includes(n));
  const route = (table: unknown, fields: string[]): any[] => {
    if (table === schema.campaigns) return st.campaign ? [st.campaign] : [];
    if (table === schema.chadGtmRuns) return st.run ? [st.run] : [];
    if (table === schema.workspaces) return st.workspace ? [st.workspace] : [];
    if (table === schema.replies) return st.replies;
    if (table === schema.uniboxMessages) return has(fields, "lastAt") ? st.outbound : [];
    if (table === schema.leadConversations) return st.handlers;
    if (table === schema.agentRequests) return st.requests;
    if (table === schema.suppressions) return st.suppressions;
    return [];
  };
  const db: any = {
    select: (fields?: Record<string, unknown>) => {
      let table: unknown;
      return chain(
        () => route(table, fields ? Object.keys(fields) : []),
        (prop, args) => {
          if (prop === "from") table = args[0];
        },
      );
    },
  };
  for (const op of ["insert", "update", "delete"] as const) {
    db[op] = (table: unknown) => {
      const entry: Write = { op, table };
      st.writes.push(entry);
      return chain(
        () => {
          // Writes land in the fake world so the action reads them back.
          if (op === "update" && table === schema.campaigns && st.campaign) Object.assign(st.campaign, entry.set);
          if (op === "update" && table === schema.chadGtmRuns && st.run) Object.assign(st.run, entry.set);
          if (op === "update" && table === schema.workspaces && st.workspace) Object.assign(st.workspace, entry.set);
          return [{ id: "row" }];
        },
        (prop, args) => {
          if (prop === "set") entry.set = args[0];
          if (prop === "values") entry.values = args[0];
          if (prop === "where") entry.where = args[0];
        },
      );
    };
  }
  return { getDb: () => db };
});

import {
  handWaitingToAgentAction,
  previewModeChangeAction,
  saveLeadConversationSettingsAction,
  setCampaignConversationModeAction,
  setRunConversationModeAction,
} from "../lead-conversation-actions";
import {
  BOOKING_HANDLED_IN_INBOX,
  BOOKING_LINK_SET,
  countBookingLinkWaiting,
  findWaitingConversations,
  releaseBookingLinkRequests,
} from "../lead-conversations-server";
import { getDb } from "../db";

const dialect = new PgDialect();
const sqlOf = (w: Write) => dialect.sqlToQuery(w.where);

const GROUNDED_WORKSPACE = {
  id: "w1",
  leadConversationMode: "manual",
  agentPaused: false,
  bookingUrl: "https://cal.example/acme",
  companySummary: "Acme automates reporting for finance teams.",
  mainOffer: "A free reporting audit",
  notifyEmail: "",
};

beforeEach(() => {
  st.writes = [];
  st.campaign = {
    id: "c1",
    workspaceId: "w1",
    status: "running",
    deletedAt: null,
    leadConversationMode: "manual",
    agentOffer: "",
  };
  st.run = null;
  st.workspace = { ...GROUNDED_WORKSPACE, bookingUrl: null, companySummary: "", mainOffer: "" };
  st.replies = [];
  st.outbound = [];
  st.handlers = [];
  st.requests = [];
  st.suppressions = [];
  st.sendMail.mockClear();
});

const campaignWrites = () => st.writes.filter((w) => w.op === "update" && w.table === schema.campaigns);
const replyWrites = () => st.writes.filter((w) => w.table === schema.replies);

describe("setCampaignConversationModeAction", () => {
  it("refuses Agent while the agent has no business profile, offer or booking link, and says what is missing", async () => {
    const r = await setCampaignConversationModeAction({ campaignId: "c1", value: "agent" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("a business profile, a main offer and a booking link");
      expect(r.error).toContain("Agent drafts, you approve");
    }
    expect(campaignWrites()).toEqual([]);
  });

  it("accepts 'Agent drafts, you approve' without grounding", async () => {
    const r = await setCampaignConversationModeAction({ campaignId: "c1", value: "approve" });
    expect(r.ok).toBe(true);
    expect(campaignWrites()[0]!.set).toMatchObject({ leadConversationMode: "approve" });
    if (r.ok) expect(r.data?.state.effective).toMatchObject({ mode: "approve", handledBy: "approve" });
  });

  it("accepts Agent once the workspace is grounded", async () => {
    st.workspace = { ...GROUNDED_WORKSPACE };
    const r = await setCampaignConversationModeAction({ campaignId: "c1", value: "agent" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.state.effective).toMatchObject({ mode: "agent", downgraded: false });
  });

  it("mirrors the mode onto the linked Autopilot run", async () => {
    st.run = { id: "run1", campaignId: "c1", workspaceId: "w1", replyAgentMode: "autopilot", bookingUrl: null, businessOverview: {}, offers: [], companyName: "Acme" };
    await setCampaignConversationModeAction({ campaignId: "c1", value: "manual" });
    const runWrite = st.writes.find((w) => w.op === "update" && w.table === schema.chadGtmRuns);
    expect(runWrite?.set).toMatchObject({ replyAgentMode: "off" });

    st.writes = [];
    await setCampaignConversationModeAction({ campaignId: "c1", value: "approve" });
    expect(st.writes.find((w) => w.table === schema.chadGtmRuns)?.set).toMatchObject({ replyAgentMode: "approve" });
  });

  it("a campaign the user does not own cannot be changed", async () => {
    st.campaign = null; // the ownership-checked lookup finds nothing
    const r = await setCampaignConversationModeAction({ campaignId: "someone-elses", value: "approve" });
    expect(r).toEqual({ ok: false, error: "Campaign not found." });
    expect(st.writes).toEqual([]);
  });

  it("rejects an unknown value", async () => {
    const r = await setCampaignConversationModeAction({ campaignId: "c1", value: "auto" as any });
    expect(r.ok).toBe(false);
    expect(st.writes).toEqual([]);
  });
});

describe("saveLeadConversationSettingsAction", () => {
  const base = { defaultMode: "approve" as const, agentPaused: false, bookingUrl: "", companySummary: "", mainOffer: "" };

  it("rejects a booking link that isn't a link", async () => {
    const r = await saveLeadConversationSettingsAction({ ...base, bookingUrl: "my calendar" });
    expect(r).toEqual({ ok: false, error: "Paste a full booking link, e.g. https://cal.com/you/intro" });
    expect(st.writes).toEqual([]);
  });

  it("refuses Agent as the default without a summary, offer and booking link", async () => {
    const r = await saveLeadConversationSettingsAction({ ...base, defaultMode: "agent", companySummary: "We automate reporting." });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("a main offer and a booking link");
    expect(st.writes).toEqual([]);
  });

  it("saves Agent once everything is there, on the active workspace only", async () => {
    const r = await saveLeadConversationSettingsAction({
      defaultMode: "agent",
      agentPaused: false,
      bookingUrl: "cal.com/acme/intro",
      companySummary: "We automate reporting.",
      mainOffer: "A reporting audit",
    });
    expect(r.ok).toBe(true);
    const w = st.writes.find((x) => x.op === "update" && x.table === schema.workspaces)!;
    expect(w.set).toMatchObject({ leadConversationMode: "agent", agentPaused: false, bookingUrl: "https://cal.com/acme/intro" });
    expect(sqlOf(w).params).toEqual(["w1", "u1"]);
    expect(replyWrites()).toEqual([]);
  });
});

describe("findWaitingConversations", () => {
  const reply = (over: Record<string, any>) => ({
    id: "r1",
    leadId: "l1",
    campaignId: "c1",
    fromEmail: "dana@acme-example.com",
    receivedAt: ago(1),
    agentStatus: null,
    agentIntent: null,
    ...over,
  });

  it("keeps recent unanswered conversations and excludes old, answered, taken-over and opted-out ones", async () => {
    st.replies = [
      reply({ id: "fresh", leadId: "l1" }),
      reply({ id: "old", leadId: "l2", fromEmail: "old@x.example", receivedAt: ago(9) }),
      reply({ id: "answered", leadId: "l3", fromEmail: "ans@x.example" }),
      reply({ id: "taken", leadId: "l4", fromEmail: "taken@x.example" }),
      reply({ id: "optout", leadId: "l5", fromEmail: "optout@x.example" }),
      reply({ id: "manual-skip", leadId: "l6", fromEmail: "m@x.example", agentStatus: "skipped", agentIntent: "manual" }),
      reply({ id: "held", leadId: "l7", fromEmail: "h@x.example", agentStatus: "escalated", agentIntent: "held" }),
      reply({ id: "agent-done", leadId: "l8", fromEmail: "d@x.example", agentStatus: "replied" }),
      reply({ id: "ooo", leadId: "l9", fromEmail: "o@x.example", agentStatus: "skipped", agentIntent: "out_of_office" }),
    ];
    st.outbound = [{ leadId: "l3", campaignId: "c1", lastAt: ago(0.5) }];
    st.handlers = [{ leadId: "l4", campaignId: "c1", handler: "you" }];
    st.suppressions = [{ value: "optout@x.example", userId: "u1", source: "manual" }];

    const out = await findWaitingConversations(getDb(), { userId: "u1", campaignIds: ["c1"] });
    expect(out.conversations.map((c) => c.replyId).sort()).toEqual(["fresh", "held", "manual-skip"]);
  });

  it("only the newest lead message of a conversation counts", async () => {
    st.replies = [
      reply({ id: "earlier", receivedAt: ago(3) }),
      reply({ id: "newest", receivedAt: ago(1), agentStatus: "human_replied" }),
    ];
    const out = await findWaitingConversations(getDb(), { userId: "u1", campaignIds: ["c1"] });
    expect(out.conversations).toEqual([]);
  });

  it("counts open approval drafts and skips conversations already waiting on you", async () => {
    st.replies = [reply({ id: "r-open" })];
    st.requests = [{ leadId: "l1", campaignId: "c1", kind: "approval" }];
    const out = await findWaitingConversations(getDb(), { userId: "u1", campaignIds: ["c1"] });
    expect(out).toEqual({ conversations: [], openDrafts: 1 });
  });
});

describe("mode changes and conversations already waiting", () => {
  beforeEach(() => {
    st.replies = [
      { id: "r-wait", leadId: "l1", campaignId: "c1", fromEmail: "dana@acme-example.com", receivedAt: ago(1), agentStatus: null, agentIntent: null },
      { id: "r-old", leadId: "l2", campaignId: "c1", fromEmail: "old@x.example", receivedAt: ago(10), agentStatus: null, agentIntent: null },
    ];
  });

  it("without applyToWaiting nothing changes in replies", async () => {
    const r = await setCampaignConversationModeAction({ campaignId: "c1", value: "approve" });
    expect(r.ok).toBe(true);
    expect(replyWrites()).toEqual([]);
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("with applyToWaiting only eligible rows go back to 'pending', conditional on the status read, and nothing is sent", async () => {
    const r = await setCampaignConversationModeAction({ campaignId: "c1", value: "approve", applyToWaiting: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.requeued).toBe(1);
    const writes = replyWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.set).toEqual({ agentStatus: "pending", agentAttempts: 0, agentClaimedAt: null, agentSummary: null });
    const where = sqlOf(writes[0]!);
    expect(where.params).toEqual(["r-wait", "u1"]);
    expect(where.sql).toContain('"agent_status" is null');
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("applyToWaiting does nothing when the new mode is Manual", async () => {
    st.campaign!.leadConversationMode = "approve";
    await setCampaignConversationModeAction({ campaignId: "c1", value: "manual", applyToWaiting: true });
    expect(replyWrites()).toEqual([]);
  });

  it("switching to Manual leaves open approval requests open", async () => {
    st.campaign!.leadConversationMode = "approve";
    st.requests = [{ leadId: "l1", campaignId: "c1", kind: "approval" }];
    const preview = await previewModeChangeAction({ campaignId: "c1" });
    expect(preview).toEqual({ ok: true, data: { waiting: 0, openDrafts: 1 } });
    await setCampaignConversationModeAction({ campaignId: "c1", value: "manual" });
    expect(st.writes.some((w) => w.table === schema.agentRequests)).toBe(false);
  });
});

describe("setRunConversationModeAction", () => {
  it("stores the mode on a run that is not launched yet", async () => {
    st.run = { id: "run1", campaignId: null, workspaceId: "w1", replyAgentMode: "autopilot", bookingUrl: null, businessOverview: {}, offers: [], companyName: "Acme" };
    const r = await setRunConversationModeAction({ runId: "run1", mode: "approve" });
    expect(r.ok).toBe(true);
    expect(st.writes.find((w) => w.table === schema.chadGtmRuns)?.set).toMatchObject({ replyAgentMode: "approve" });
    expect(campaignWrites()).toEqual([]);
  });

  it("a launched run changes its campaign", async () => {
    st.run = { id: "run1", campaignId: "c1", workspaceId: "w1", replyAgentMode: "autopilot", bookingUrl: null, businessOverview: {}, offers: [], companyName: "Acme" };
    const r = await setRunConversationModeAction({ runId: "run1", mode: "manual" });
    expect(r.ok).toBe(true);
    expect(campaignWrites()[0]!.set).toMatchObject({ leadConversationMode: "manual" });
  });
});

/* ─── #11: turning the agent back on ─────────────────────────────────── */

describe("unpausing the agent", () => {
  const paused = { defaultMode: "agent" as const, bookingUrl: "https://cal.example/acme", companySummary: "Acme automates reporting for finance teams.", mainOffer: "A free reporting audit" };

  beforeEach(() => {
    st.workspace = { ...GROUNDED_WORKSPACE, leadConversationMode: "agent", agentPaused: true };
    st.campaign!.leadConversationMode = "agent";
    // Replies that arrived while paused were never given to the agent (status null).
    st.replies = [
      { id: "r-paused", leadId: "l1", campaignId: "c1", fromEmail: "dana@acme-example.com", receivedAt: ago(1), agentStatus: null, agentIntent: null },
    ];
  });

  it("saving with the pause off reports what is waiting and changes no reply", async () => {
    const r = await saveLeadConversationSettingsAction({ ...paused, agentPaused: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toMatchObject({ waiting: 1, requeued: 0 });
    expect(st.workspace!.agentPaused).toBe(false);
    expect(replyWrites()).toEqual([]);
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("the waiting conversations go to the agent only on confirm, and nothing is sent", async () => {
    await saveLeadConversationSettingsAction({ ...paused, agentPaused: false });
    expect(replyWrites()).toEqual([]);
    const r = await handWaitingToAgentAction({ workspace: true });
    expect(r).toMatchObject({ ok: true, data: { requeued: 1 } });
    const writes = replyWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]!.set).toMatchObject({ agentStatus: "pending" });
    expect(sqlOf(writes[0]!).params).toEqual(["r-paused", "u1"]);
    expect(st.sendMail).not.toHaveBeenCalled();
  });

  it("handing over is refused while the agent is still paused", async () => {
    const r = await handWaitingToAgentAction({ workspace: true });
    expect(r.ok).toBe(false);
    expect(replyWrites()).toEqual([]);
  });

  it("pausing again reports nothing and touches no reply", async () => {
    st.workspace!.agentPaused = false;
    const r = await saveLeadConversationSettingsAction({ ...paused, agentPaused: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data?.waiting).toBe(0);
    expect(replyWrites()).toEqual([]);
  });

  it("after Resume, a campaign's held replies go to the agent only on confirm", async () => {
    st.workspace!.agentPaused = false;
    st.replies = [
      { id: "r-held", leadId: "l1", campaignId: "c1", fromEmail: "dana@acme-example.com", receivedAt: ago(1), agentStatus: "escalated", agentIntent: "held" },
    ];
    const preview = await previewModeChangeAction({ campaignId: "c1" });
    expect(preview).toEqual({ ok: true, data: { waiting: 1, openDrafts: 0 } });
    expect(replyWrites()).toEqual([]);
    const r = await handWaitingToAgentAction({ campaignId: "c1" });
    expect(r).toMatchObject({ ok: true, data: { requeued: 1 } });
    expect(replyWrites()[0]!.set).toMatchObject({ agentStatus: "pending" });
  });

  it("a campaign still paused is not handed over", async () => {
    st.workspace!.agentPaused = false;
    st.campaign!.status = "paused";
    const r = await handWaitingToAgentAction({ campaignId: "c1" });
    expect(r).toEqual({ ok: false, error: "Resume the campaign first." });
    expect(replyWrites()).toEqual([]);
  });
});

/* ─── #12: saving a booking link ─────────────────────────────────────── */

/**
 * A small stateful fake: conditional UPDATEs on agent_requests and replies
 * apply only when the row is in the status the WHERE asks for, so a second
 * save (or a concurrent one) finds nothing to claim.
 */
function bookingWorld(opts: {
  outbound?: Array<{ id: string }>;
  inbound?: Array<{ id: string }>;
  handler?: "you" | null;
  campaignMode?: string;
}) {
  const requests = new Map<string, any>([
    ["req-1", { id: "req-1", replyId: "r1", leadId: "l1", campaignId: "c1", status: "open", kind: "booking_url" }],
  ]);
  const replies = new Map<string, any>([
    ["r1", { id: "r1", leadId: "l1", campaignId: "c1", receivedAt: "2026-11-05T10:00:00.000Z", agentStatus: "escalated" }],
  ]);
  const writes: Write[] = [];
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
  const select = (fields?: Record<string, unknown>) => {
    let table: unknown;
    const keys = fields ? Object.keys(fields) : [];
    return chain(
      () => {
        if (table === schema.agentRequests) {
          // The open booking cards (loadConversationHandlers asks for open cards too).
          return [...requests.values()].filter((r) => r.status === "open" || (keys.includes("createdAt") && r.status === "sending"));
        }
        if (table === schema.replies) return keys.includes("agentStatus") ? [...replies.values()] : (opts.inbound ?? []);
        if (table === schema.uniboxMessages) return opts.outbound ?? [];
        if (table === schema.campaigns) {
          return [{ id: "c1", userId: "u1", workspaceId: "w1", leadConversationMode: opts.campaignMode ?? "agent", agentOffer: "" }];
        }
        if (table === schema.workspaces) return [{ ...GROUNDED_WORKSPACE, isDefault: true, createdAt: "2026-01-01" }];
        if (table === schema.leadConversations) return opts.handler ? [{ leadId: "l1", campaignId: "c1", handler: opts.handler }] : [];
        return [];
      },
      (prop, args) => {
        if (prop === "from") table = args[0];
      },
    );
  };
  const update = (table: unknown) => {
    const entry: Write = { op: "update", table };
    writes.push(entry);
    return chain(
      () => {
        const q = dialect.sqlToQuery(entry.where);
        const id = String(q.params[0]);
        if (table === schema.agentRequests) {
          const row = requests.get(id);
          const need = entry.set.status === "sending" ? "open" : "sending";
          if (!row || row.status !== need) return [];
          Object.assign(row, entry.set);
          return [{ id }];
        }
        if (table === schema.replies) {
          const row = replies.get(id);
          if (!row || row.agentStatus !== "escalated") return [];
          Object.assign(row, entry.set);
          return [{ id }];
        }
        return [];
      },
      (prop, args) => {
        if (prop === "set") entry.set = args[0];
        if (prop === "where") entry.where = args[0];
      },
    );
  };
  return { db: { select, update } as any, requests, replies, writes };
}

describe("releaseBookingLinkRequests", () => {
  const input = { userId: "u1", runId: "run1", bookingUrl: "https://cal.example/acme", nowIso: "2026-11-06T12:00:00.000Z" };

  it("re-queues an untouched waiting card's reply, once, and a second save does nothing", async () => {
    const w = bookingWorld({});
    expect(await countBookingLinkWaiting(w.db, { userId: "u1", runId: "run1" })).toBe(1);
    expect(await releaseBookingLinkRequests(w.db, input)).toEqual({ answered: 1, skipped: 0 });
    expect(w.requests.get("req-1")).toMatchObject({ status: "resolved", resolution: BOOKING_LINK_SET });
    expect(w.replies.get("r1")).toMatchObject({ agentStatus: "pending", agentAttempts: 0, agentClaimedAt: null });
    // The re-queue is conditional on the reply still being 'escalated'.
    const requeue = w.writes.find((x) => x.table === schema.replies)!;
    expect(dialect.sqlToQuery(requeue.where).params).toEqual(["r1", "u1", "escalated"]);

    const writesBefore = w.writes.length;
    expect(await releaseBookingLinkRequests(w.db, input)).toEqual({ answered: 0, skipped: 0 });
    expect(w.writes.length).toBe(writesBefore);
  });

  it("two saves at the same time claim the card once", async () => {
    const w = bookingWorld({});
    const [a, b] = await Promise.all([releaseBookingLinkRequests(w.db, input), releaseBookingLinkRequests(w.db, input)]);
    expect(a.answered + b.answered).toBe(1);
    expect(w.writes.filter((x) => x.table === schema.replies)).toHaveLength(1);
  });

  it("closes the card as 'Handled in the Inbox' and leaves its reply alone when someone wrote after it", async () => {
    const w = bookingWorld({ outbound: [{ id: "m-op" }] });
    expect(await countBookingLinkWaiting(w.db, { userId: "u1", runId: "run1" })).toBe(0);
    expect(await releaseBookingLinkRequests(w.db, input)).toEqual({ answered: 0, skipped: 1 });
    expect(w.requests.get("req-1")).toMatchObject({ status: "resolved", resolution: BOOKING_HANDLED_IN_INBOX });
    expect(w.replies.get("r1")!.agentStatus).toBe("escalated");
    expect(w.writes.some((x) => x.table === schema.replies)).toBe(false);
  });

  it("a newer message from the lead also counts as handled", async () => {
    const w = bookingWorld({ inbound: [{ id: "r2" }] });
    expect(await releaseBookingLinkRequests(w.db, input)).toEqual({ answered: 0, skipped: 1 });
    expect(w.replies.get("r1")!.agentStatus).toBe("escalated");
  });

  it("a taken-over conversation is not re-queued", async () => {
    const w = bookingWorld({ handler: "you" });
    expect(await releaseBookingLinkRequests(w.db, input)).toEqual({ answered: 0, skipped: 1 });
    expect(w.requests.get("req-1")!.resolution).toBe(BOOKING_HANDLED_IN_INBOX);
    expect(w.writes.some((x) => x.table === schema.replies)).toBe(false);
  });

  it("a Manual campaign is not re-queued", async () => {
    const w = bookingWorld({ campaignMode: "manual" });
    expect(await releaseBookingLinkRequests(w.db, input)).toEqual({ answered: 0, skipped: 1 });
    expect(w.writes.some((x) => x.table === schema.replies)).toBe(false);
  });
});

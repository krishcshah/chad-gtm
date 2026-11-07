import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";
import {
  CAMPAIGN_ARCHIVED_SUMMARY,
  CAMPAIGN_DELETED_SUMMARY,
  CAMPAIGN_PAUSED_SUMMARY,
  CAMPAIGN_STOPPED_SUMMARY,
  OPEN_REQUEST_STATUSES,
  OUT_OF_OFFICE_SUMMARY,
  PAUSED_SUMMARY,
  WAITING_ON_YOU_SUMMARY,
  attachReplyToOpenRequest,
  campaignStoppedSummary,
  decideInboundAgentStatus,
  findOpenConversationRequest,
  groundingFor,
  outcomeForBlocker,
  preSendBlockers,
  summaryForHandledByYou,
  resolveConversationMode,
  setConversationHandler,
} from "../lead-conversations";
import { conversationDb, has } from "./fixtures/conversation-db";

const FULL = groundingFor({ summary: "We automate reporting.", offer: "Reporting audit", bookingUrl: "https://cal.example/x" });

describe("groundingFor", () => {
  it("lists what is missing in plain words", () => {
    expect(groundingFor({})).toEqual({ complete: false, missing: ["business profile", "main offer", "booking link"] });
    expect(FULL).toEqual({ complete: true, missing: [] });
    expect(groundingFor({ summary: "x", offer: "  ", bookingUrl: "https://a.example" }).missing).toEqual(["main offer"]);
  });
});

describe("resolveConversationMode", () => {
  const base = { workspaceDefault: "agent" as const, agentPaused: false, handler: "campaign" as const, grounding: FULL };

  it("no campaign: you", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: null })).toMatchObject({ handledBy: "you", reason: "no_campaign" });
  });
  it("agent paused everywhere: you", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: "agent", agentPaused: true })).toMatchObject({
      handledBy: "you",
      reason: "paused",
    });
  });
  it("taken over: you", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: "agent", handler: "you" })).toMatchObject({
      handledBy: "you",
      reason: "conversation",
    });
  });
  it("campaign set to Manual: you", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: "manual" })).toMatchObject({
      mode: "manual",
      handledBy: "you",
      reason: "campaign",
    });
  });
  it("'default' follows the workspace default", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: "default" })).toMatchObject({
      mode: "agent",
      handledBy: "agent",
      reason: "workspace",
    });
    expect(resolveConversationMode({ ...base, campaignSetting: "default", workspaceDefault: "approve" })).toMatchObject({
      handledBy: "approve",
      reason: "workspace",
    });
  });
  it("no workspace settings row means Manual", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: "default", workspaceDefault: null })).toMatchObject({
      handledBy: "you",
      reason: "workspace",
    });
  });
  it("Agent without booking link, summary or offer drops to Agent drafts and says what is missing", () => {
    const r = resolveConversationMode({ ...base, campaignSetting: "agent", grounding: groundingFor({ summary: "x" }) });
    expect(r).toEqual({
      mode: "approve",
      handledBy: "approve",
      reason: "campaign",
      downgraded: true,
      missing: ["main offer", "booking link"],
    });
  });
  it("an unknown stored value is treated as Manual", () => {
    expect(resolveConversationMode({ ...base, campaignSetting: "autopilot" })).toMatchObject({ handledBy: "you" });
  });
});

describe("preSendBlockers", () => {
  const CLAIM = "2026-11-06T12:00:00.000Z";
  const ok = {
    effective: { handledBy: "agent" as const },
    reply: { agentStatus: "processing", agentClaimedAt: CLAIM, receivedAt: "2026-11-06T11:00:00.000Z" },
    claimedAt: CLAIM,
    ctx: { campaign: { status: "running", deletedAt: null }, openRequest: null, lastOutboundAt: null },
    suppressed: false,
    ownerApproved: true,
    senderUsable: true,
  };

  it("allows the send only when every check holds", () => {
    expect(preSendBlockers(ok)).toBeNull();
  });
  it("claim_lost when the row changed or is no longer processing", () => {
    expect(preSendBlockers({ ...ok, reply: { ...ok.reply, agentStatus: "human_replied" } })).toBe("claim_lost");
    expect(preSendBlockers({ ...ok, reply: { ...ok.reply, agentClaimedAt: "2026-11-06T12:05:00.000Z" } })).toBe("claim_lost");
  });
  it("handled_by_you", () => {
    expect(preSendBlockers({ ...ok, effective: { handledBy: "you" } })).toBe("handled_by_you");
    // A reply needs Agent; Agent drafts may only open a card.
    expect(preSendBlockers({ ...ok, effective: { handledBy: "approve" } })).toBe("handled_by_you");
    expect(preSendBlockers({ ...ok, effective: { handledBy: "approve" }, action: "escalate" })).toBeNull();
  });
  it("answered_after when an operator message is at or after the lead's message", () => {
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, lastOutboundAt: "2026-11-06T11:00:00.000Z" } })).toBe("answered_after");
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, lastOutboundAt: "2026-11-06T11:30:00.000Z" } })).toBe("answered_after");
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, lastOutboundAt: "2026-11-06T10:00:00.000Z" } })).toBeNull();
  });
  it("waiting_on_you while a Needs you card is open", () => {
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, openRequest: { id: "req" } } })).toBe("waiting_on_you");
  });
  it("opted_out", () => {
    expect(preSendBlockers({ ...ok, suppressed: true })).toBe("opted_out");
  });
  it("campaign_stopped when paused, archived or deleted", () => {
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, campaign: { status: "paused", deletedAt: null } } })).toBe("campaign_stopped");
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, campaign: { status: "archived", deletedAt: null } } })).toBe(
      "campaign_stopped",
    );
    expect(
      preSendBlockers({ ...ok, ctx: { ...ok.ctx, campaign: { status: "running", deletedAt: "2026-11-06T11:59:00.000Z" } } }),
    ).toBe("campaign_stopped");
    expect(preSendBlockers({ ...ok, ctx: { ...ok.ctx, campaign: null } })).toBe("campaign_stopped");
  });
  it("not_approved", () => {
    expect(preSendBlockers({ ...ok, ownerApproved: false })).toBe("not_approved");
  });
  it("mailbox_unusable", () => {
    expect(preSendBlockers({ ...ok, senderUsable: false })).toBe("mailbox_unusable");
  });
});

/* ─── Inbound decision (sync) ──────────────────────────────────────────── */

function inboundDb(opts: {
  campaign?: Record<string, unknown> | null;
  handler?: "campaign" | "you";
  openRequest?: Record<string, unknown> | null;
  workspace?: Record<string, unknown> | null;
  run?: Record<string, unknown> | null;
  throwOn?: unknown;
}) {
  return conversationDb(
    new Map<unknown, any>([
      [
        schema.campaigns,
        () =>
          opts.campaign === null
            ? []
            : [
                {
                  id: "c1",
                  userId: "u1",
                  workspaceId: "w1",
                  status: "running",
                  deletedAt: null,
                  leadConversationMode: "agent",
                  agentOffer: "",
                  ...opts.campaign,
                },
              ],
      ],
      [schema.chadGtmRuns, () => (opts.run ? [opts.run] : [])],
      [
        schema.workspaces,
        () =>
          opts.workspace === null
            ? []
            : [
                {
                  id: "w1",
                  leadConversationMode: "manual",
                  agentPaused: false,
                  companySummary: "We automate reporting.",
                  mainOffer: "Reporting audit",
                  bookingUrl: "https://cal.example/x",
                  companyName: "Acme",
                  ...opts.workspace,
                },
              ],
      ],
      [schema.leadConversations, () => (opts.handler ? [{ handler: opts.handler }] : [])],
      [schema.agentRequests, () => (opts.openRequest ? [opts.openRequest] : [])],
      [schema.uniboxMessages, ({ fields }: { fields: string[] }) => (has(fields, "lastOutboundAt") ? [{ lastOutboundAt: null }] : [])],
    ]),
    { throwOn: (t) => opts.throwOn !== undefined && t === opts.throwOn },
  );
}

const IN = { campaignId: "c1", leadId: "l1", autoReplyAuto: false, classifiedTag: "interested" };

describe("decideInboundAgentStatus", () => {
  it("'pending' for an agent campaign", async () => {
    const { db } = inboundDb({});
    expect(await decideInboundAgentStatus(db, IN)).toEqual({ agentStatus: "pending" });
  });
  it("null (a person answers) for a Manual campaign", async () => {
    const { db } = inboundDb({ campaign: { leadConversationMode: "manual" } });
    expect((await decideInboundAgentStatus(db, IN)).agentStatus).toBeNull();
  });
  it("null for a campaign on the workspace default when that is Manual", async () => {
    const { db } = inboundDb({ campaign: { leadConversationMode: "default" } });
    expect((await decideInboundAgentStatus(db, IN)).agentStatus).toBeNull();
  });
  it("null for a taken-over conversation", async () => {
    const { db } = inboundDb({ handler: "you" });
    expect((await decideInboundAgentStatus(db, IN)).agentStatus).toBeNull();
  });
  it("null when a lookup throws (fail closed: nobody auto-answers)", async () => {
    const { db } = inboundDb({ throwOn: schema.leadConversations });
    expect(await decideInboundAgentStatus(db, IN)).toEqual({ agentStatus: null });
  });
  it("null with no campaign", async () => {
    const { db } = inboundDb({});
    expect((await decideInboundAgentStatus(db, { ...IN, campaignId: null })).agentStatus).toBeNull();
  });
  it("skips out-of-office messages (header auto-replies and classified ones)", async () => {
    const { db } = inboundDb({});
    expect(await decideInboundAgentStatus(db, { ...IN, autoReplyAuto: true, autoReason: "X-Autoreply" })).toMatchObject({
      agentStatus: "skipped",
      agentIntent: "out_of_office",
    });
    expect(await decideInboundAgentStatus(db, { ...IN, classifiedTag: "out_of_office" })).toEqual({
      agentStatus: "skipped",
      agentIntent: "out_of_office",
      agentSummary: OUT_OF_OFFICE_SUMMARY,
    });
  });
  it("a reply the regex tagged out of office (no auto-reply headers) is skipped, and says follow-ups continue", async () => {
    const { db } = inboundDb({});
    const decision = await decideInboundAgentStatus(db, { ...IN, autoReplyAuto: false, classifiedTag: "out_of_office" });
    expect(decision).toEqual({ agentStatus: "skipped", agentIntent: "out_of_office", agentSummary: OUT_OF_OFFICE_SUMMARY });
    expect(OUT_OF_OFFICE_SUMMARY).toBe(
      "Tagged out of office when it arrived, so the agent didn't answer and follow-ups continue. If it's a real reply, answer it from the Inbox.",
    );
  });
  it("Manual campaigns leave the reply for a person; Agent with grounding queues it", async () => {
    expect((await decideInboundAgentStatus(inboundDb({ campaign: { leadConversationMode: "manual" } }).db, IN)).agentStatus).toBeNull();
    expect((await decideInboundAgentStatus(inboundDb({ campaign: { leadConversationMode: "agent" } }).db, IN)).agentStatus).toBe(
      "pending",
    );
  });
  it("a second lead message while a card is open joins the card instead of waking the agent", async () => {
    const { db, writes } = inboundDb({
      openRequest: { id: "req-1", replyId: "r-old", kind: "question", status: "open", createdAt: "2026-11-06T10:00:00.000Z" },
    });
    const decision = await decideInboundAgentStatus(db, IN);
    expect(decision).toEqual({
      agentStatus: "escalated",
      agentIntent: "other",
      agentSummary: WAITING_ON_YOU_SUMMARY,
      attachToRequestId: "req-1",
    });
    // sync-replies then points the card at the new message.
    await attachReplyToOpenRequest(db, decision.attachToRequestId!, "r-new", "2026-11-06T12:00:00.000Z");
    expect(writes).toEqual([
      { op: "update", table: schema.agentRequests, set: { replyId: "r-new", updatedAt: "2026-11-06T12:00:00.000Z" } },
    ]);
  });
});

describe("setConversationHandler", () => {
  it("upserts the handler for the lead + campaign", async () => {
    const { db, writes } = conversationDb(new Map());
    await setConversationHandler(db, {
      userId: "u1",
      workspaceId: "w1",
      leadId: "l1",
      campaignId: "c1",
      handler: "you",
      reason: "send",
      nowIso: "2026-11-06T12:00:00.000Z",
    });
    expect(writes[0]?.table).toBe(schema.leadConversations);
    expect(writes[0]?.values).toMatchObject({ leadId: "l1", campaignId: "c1", handler: "you", handlerReason: "send" });
  });
});

/* ─── Pausing (#11) ────────────────────────────────────────────────────── */

describe("pausing", () => {
  it("'Pause the agent everywhere' makes every campaign in the workspace yours, whatever its mode", () => {
    for (const campaignSetting of ["agent", "approve", "manual", "default"]) {
      const e = resolveConversationMode({ campaignSetting, workspaceDefault: "agent", agentPaused: true, grounding: FULL });
      expect(e).toMatchObject({ handledBy: "you", reason: "paused" });
    }
    expect(summaryForHandledByYou("paused")).toBe(PAUSED_SUMMARY);
  });

  it("with the agent paused, new lead messages wait for a person (agent status null) in every campaign", async () => {
    for (const leadConversationMode of ["agent", "approve", "default"]) {
      const { db } = inboundDb({ campaign: { leadConversationMode }, workspace: { agentPaused: true, leadConversationMode: "agent" } });
      expect(await decideInboundAgentStatus(db, IN)).toEqual({ agentStatus: null });
    }
  });

  it("a held reply says why: paused, archived or deleted", () => {
    expect(campaignStoppedSummary({ status: "paused", deletedAt: null })).toBe(CAMPAIGN_PAUSED_SUMMARY);
    expect(campaignStoppedSummary({ status: "archived", deletedAt: null })).toBe(CAMPAIGN_ARCHIVED_SUMMARY);
    expect(campaignStoppedSummary({ status: "paused", deletedAt: "2026-11-01T00:00:00.000Z" })).toBe(CAMPAIGN_DELETED_SUMMARY);
    expect(campaignStoppedSummary(null)).toBe(CAMPAIGN_STOPPED_SUMMARY);
    expect(CAMPAIGN_PAUSED_SUMMARY).toBe(
      "Held: the campaign is paused, so the agent didn't reply. Reply from the Inbox, or resume the campaign.",
    );
    expect(outcomeForBlocker("campaign_stopped", { reason: "campaign" }, { status: "paused" })).toEqual({
      status: "escalated",
      intent: "held",
      summary: CAMPAIGN_PAUSED_SUMMARY,
    });
  });
});

describe("a card being sent still waits on you", () => {
  it("'sending' counts as open", () => {
    expect([...OPEN_REQUEST_STATUSES]).toEqual(["open", "sending"]);
  });

  it("findOpenConversationRequest looks for open and sending cards", async () => {
    let where: any = null;
    const chain: any = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (resolve: any) => resolve([{ id: "req-1", status: "sending" }]);
          return (...args: any[]) => {
            if (prop === "where") where = args[0];
            return chain;
          };
        },
      },
    );
    const db: any = { select: () => chain };
    const found = await findOpenConversationRequest(db, { leadId: "l1", campaignId: "c1" });
    expect(found).toMatchObject({ id: "req-1", status: "sending" });
    expect(new PgDialect().sqlToQuery(where).params).toEqual(["l1", "c1", "open", "sending"]);
  });
});

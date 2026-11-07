/**
 * "Lead conversations": who talks to a lead in one campaign.
 *
 *   workspace default  (workspaces.lead_conversation_mode, agent_paused)
 *   campaign setting   (campaigns.lead_conversation_mode, 'default' = workspace)
 *   conversation       (lead_conversations.handler, 'you' = taken over)
 *
 * resolveConversationMode() turns those into who handles the conversation
 * right now. Sync uses it to decide whether a new lead message goes to the
 * agent, the reply agent re-checks it before every side effect, and the web
 * app shows it as the "Handled by" chip.
 *
 * Everything here fails closed: when something cannot be loaded, nobody
 * auto-answers and the lead's message waits for a person in the Inbox.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { EngineDb } from "./db-port";
import { isSuppressedFor, loadApplicableSuppressions } from "./suppression";
import { matchesSuppression } from "@smartreach/database";
import { loadUnapprovedOwners } from "./owner-approval";
import { replyMailboxBlockReason } from "./mailbox-health";

/* ─── Types ──────────────────────────────────────────────────────────── */

export const LEAD_CONVERSATION_MODES = ["agent", "approve", "manual"] as const;
export type LeadConversationMode = (typeof LEAD_CONVERSATION_MODES)[number];
export type CampaignConversationSetting = "default" | LeadConversationMode;
export type ConversationHandler = "campaign" | "you";
export type ConversationHandlerReason = "send" | "take_over" | "dismiss" | "hand_back";
export type GroundingGap = "business profile" | "main offer" | "booking link";
/** Who answers the lead: the agent, the agent with your approval, or you. */
export type HandledBy = "agent" | "approve" | "you";
export type ConversationModeReason = "no_campaign" | "conversation" | "paused" | "campaign" | "workspace";

/** agent_requests statuses that put a conversation in "Waiting on you". */
export const OPEN_REQUEST_STATUSES = ["open", "sending"] as const;

export interface Grounding {
  complete: boolean;
  missing: GroundingGap[];
}

export interface EffectiveConversation {
  mode: LeadConversationMode;
  handledBy: HandledBy;
  reason: ConversationModeReason;
  /** The setting was Agent but grounding is incomplete, so drafts need approval. */
  downgraded: boolean;
  missing: GroundingGap[];
}

/* ─── Copy (shown as the reply's agent summary) ───────────────────────── */

export const TAKEN_OVER_SUMMARY = "You've taken over this conversation, so the agent didn't reply.";
export const ANSWERED_SUMMARY = "Already answered in this conversation.";
export const MANUAL_SUMMARY = "This campaign is set to Manual. Answer from the Inbox.";
export const PAUSED_SUMMARY = "The agent is paused for this workspace. Answer from the Inbox.";
export const NO_CAMPAIGN_SUMMARY = "This reply isn't part of a campaign, so the agent didn't reply.";
export const WAITING_ON_YOU_SUMMARY = "Waiting on you: added to the open Needs you card.";
export const OUT_OF_OFFICE_SUMMARY =
  "Tagged out of office when it arrived, so the agent didn't answer and follow-ups continue. If it's a real reply, answer it from the Inbox.";
export const OPTED_OUT_SUMMARY = "The lead has opted out, so the agent didn't reply.";
export const CAMPAIGN_STOPPED_SUMMARY =
  "Held: this campaign is paused or removed, so the agent didn't reply. Reply from the Inbox.";
export const CAMPAIGN_PAUSED_SUMMARY =
  "Held: the campaign is paused, so the agent didn't reply. Reply from the Inbox, or resume the campaign.";
export const CAMPAIGN_ARCHIVED_SUMMARY =
  "Held: the campaign is archived, so the agent didn't reply. Reply from the Inbox.";
export const CAMPAIGN_DELETED_SUMMARY =
  "Held: the campaign was deleted, so the agent didn't reply. Reply from the Inbox.";
export const MAILBOX_UNUSABLE_SUMMARY =
  "Held: the mailbox that received this reply can't send right now. Reply from the Inbox.";
/** Mirrors reply-agent's AGENT_OWNER_NOT_APPROVED_SUMMARY (kept here to avoid an import cycle). */
export const OWNER_NOT_APPROVED_SUMMARY =
  "Held: your account is on hold, so the agent didn't answer. When an admin approves the account, this conversation moves to Needs you.";
export const HUMAN_REPLIED_SUMMARY = "You replied.";
/**
 * Written (still 'processing') right before the agent's SMTP send: from here a
 * person's "Send mine" is refused, so the lead never gets both emails.
 */
export const AGENT_SENDING_SUMMARY = "The agent is sending its reply.";

/** Why the agent stayed silent when the conversation is handled by you. */
export function summaryForHandledByYou(reason: ConversationModeReason): string {
  switch (reason) {
    case "no_campaign":
      return NO_CAMPAIGN_SUMMARY;
    case "paused":
      return PAUSED_SUMMARY;
    case "conversation":
      return TAKEN_OVER_SUMMARY;
    default:
      return MANUAL_SUMMARY;
  }
}

/** Which of these lead emails are suppressed for `userId` (own list or a global opt-out). */
export async function suppressedEmails(db: EngineDb, userId: string, emails: string[]): Promise<Set<string>> {
  const unique = [...new Set(emails.filter(Boolean))];
  if (unique.length === 0) return new Set();
  const values = await loadApplicableSuppressions(db, userId, unique);
  return new Set(unique.filter((e) => matchesSuppression(e, values)));
}

/* ─── Pure policy ─────────────────────────────────────────────────────── */

function asMode(value: unknown): LeadConversationMode {
  return (LEAD_CONVERSATION_MODES as readonly unknown[]).includes(value) ? (value as LeadConversationMode) : "manual";
}

function asSetting(value: unknown): CampaignConversationSetting {
  return value === "default" ? "default" : asMode(value);
}

/** What the agent needs before it may answer on its own. */
export function groundingFor(input: {
  summary?: string | null;
  offer?: string | null;
  bookingUrl?: string | null;
}): Grounding {
  const missing: GroundingGap[] = [];
  if (!String(input.summary ?? "").trim()) missing.push("business profile");
  if (!String(input.offer ?? "").trim()) missing.push("main offer");
  if (!String(input.bookingUrl ?? "").trim()) missing.push("booking link");
  return { complete: missing.length === 0, missing };
}

/**
 * Who handles a conversation. Rules, in order: no campaign → you; agent
 * paused → you; taken over → you; campaign setting (or the workspace default
 * when 'default'; Manual when there is no workspace row); Manual → you;
 * Agent without full grounding → Agent drafts, you approve.
 */
export function resolveConversationMode(input: {
  campaignSetting: CampaignConversationSetting | string | null;
  workspaceDefault?: LeadConversationMode | string | null;
  agentPaused?: boolean | null;
  handler?: ConversationHandler | string | null;
  grounding: Grounding;
}): EffectiveConversation {
  const you = (reason: ConversationModeReason): EffectiveConversation => ({
    mode: "manual",
    handledBy: "you",
    reason,
    downgraded: false,
    missing: input.grounding.missing,
  });
  if (input.campaignSetting == null) return you("no_campaign");
  if (input.agentPaused) return you("paused");
  if (input.handler === "you") return you("conversation");
  const setting = asSetting(input.campaignSetting);
  const reason: ConversationModeReason = setting === "default" ? "workspace" : "campaign";
  const base: LeadConversationMode = setting === "default" ? asMode(input.workspaceDefault ?? "manual") : setting;
  if (base === "manual") return you(reason);
  if (base === "agent" && !input.grounding.complete) {
    return { mode: "approve", handledBy: "approve", reason, downgraded: true, missing: input.grounding.missing };
  }
  return { mode: base, handledBy: base, reason, downgraded: false, missing: input.grounding.missing };
}

export type PreSendBlocker =
  | "claim_lost"
  | "handled_by_you"
  | "answered_after"
  | "waiting_on_you"
  | "opted_out"
  | "campaign_stopped"
  | "not_approved"
  | "mailbox_unusable";

/** Did someone (you, a teammate or the agent) write after this lead message? */
export function answeredAfter(lastOutboundAt: string | null | undefined, receivedAt: string | null | undefined): boolean {
  if (!lastOutboundAt) return false;
  const out = Date.parse(lastOutboundAt);
  const got = Date.parse(String(receivedAt ?? ""));
  // Unknown times: assume answered (fail closed).
  if (!Number.isFinite(out) || !Number.isFinite(got)) return true;
  return out >= got;
}

export function isCampaignStopped(campaign: { status?: string | null; deletedAt?: string | null } | null | undefined): boolean {
  if (!campaign) return true;
  return campaign.status === "paused" || campaign.status === "archived" || Boolean(campaign.deletedAt);
}

/** Why a stopped campaign held the reply: paused, archived or deleted. */
export function campaignStoppedSummary(
  campaign: { status?: string | null; deletedAt?: string | null } | null | undefined,
): string {
  if (!campaign) return CAMPAIGN_STOPPED_SUMMARY;
  if (campaign.deletedAt) return CAMPAIGN_DELETED_SUMMARY;
  if (campaign.status === "archived") return CAMPAIGN_ARCHIVED_SUMMARY;
  if (campaign.status === "paused") return CAMPAIGN_PAUSED_SUMMARY;
  return CAMPAIGN_STOPPED_SUMMARY;
}

/** Replies still go out from a paused mailbox; a failed or retired one never sends. */
export function isSenderUsable(
  sender: { status?: string | null; deletedAt?: string | null } | null | undefined,
): boolean {
  return replyMailboxBlockReason(sender) === null;
}

/**
 * The first reason the agent must not act (send, or open a Needs you card),
 * or null when every check holds. `action` 'reply' needs the conversation
 * handled by Agent; 'escalate' (a draft or question for you) also allows
 * Agent drafts.
 */
export function preSendBlockers(input: {
  effective: Pick<EffectiveConversation, "handledBy">;
  reply: { agentStatus: string | null; agentClaimedAt: string | null; receivedAt: string | null };
  claimedAt: string;
  ctx: {
    campaign: { status?: string | null; deletedAt?: string | null } | null;
    openRequest: unknown | null;
    lastOutboundAt: string | null;
  };
  suppressed: boolean;
  ownerApproved: boolean;
  senderUsable: boolean;
  action?: "reply" | "escalate";
}): PreSendBlocker | null {
  if (input.reply.agentStatus !== "processing" || input.reply.agentClaimedAt !== input.claimedAt) return "claim_lost";
  const action = input.action ?? "reply";
  if (input.effective.handledBy === "you") return "handled_by_you";
  if (action === "reply" && input.effective.handledBy !== "agent") return "handled_by_you";
  if (answeredAfter(input.ctx.lastOutboundAt, input.reply.receivedAt)) return "answered_after";
  if (input.ctx.openRequest) return "waiting_on_you";
  if (input.suppressed) return "opted_out";
  if (isCampaignStopped(input.ctx.campaign)) return "campaign_stopped";
  if (!input.ownerApproved) return "not_approved";
  if (!input.senderUsable) return "mailbox_unusable";
  return null;
}

/** How the reply row is finished when a blocker stops the agent (null = write nothing). */
export function outcomeForBlocker(
  blocker: PreSendBlocker,
  effective: Pick<EffectiveConversation, "reason">,
  campaign?: { status?: string | null; deletedAt?: string | null } | null,
): { status: "skipped" | "escalated" | "held"; intent: string; summary: string } | null {
  switch (blocker) {
    case "claim_lost":
      return null;
    case "handled_by_you":
      return { status: "skipped", intent: "manual", summary: summaryForHandledByYou(effective.reason) };
    case "answered_after":
      return { status: "skipped", intent: "answered", summary: ANSWERED_SUMMARY };
    case "waiting_on_you":
      return { status: "escalated", intent: "other", summary: WAITING_ON_YOU_SUMMARY };
    case "opted_out":
      return { status: "skipped", intent: "unsubscribe", summary: OPTED_OUT_SUMMARY };
    case "campaign_stopped":
      return { status: "escalated", intent: "held", summary: campaignStoppedSummary(campaign) };
    case "not_approved":
      // Account on hold: its own state, released into Needs you on approval.
      return { status: "held", intent: "other", summary: OWNER_NOT_APPROVED_SUMMARY };
    case "mailbox_unusable":
      return { status: "escalated", intent: "held", summary: MAILBOX_UNUSABLE_SUMMARY };
  }
}

/* ─── Loading ─────────────────────────────────────────────────────────── */

export interface ConversationContext {
  campaign: {
    id: string;
    userId: string;
    workspaceId: string | null;
    status: string;
    deletedAt: string | null;
    leadConversationMode: string;
    agentOffer: string;
  };
  run: {
    id: string;
    userId: string;
    workspaceId: string | null;
    companyName: string;
    bookingUrl: string | null;
    businessOverview: any;
    offers: any;
  } | null;
  /** Workspace settings: the campaign's workspace, else the owner's default. */
  settings: {
    id: string;
    leadConversationMode: string;
    agentPaused: boolean;
    companySummary: string;
    mainOffer: string;
    bookingUrl: string | null;
    companyName: string;
    /** The workspace is the owner's default (it also holds legacy rows with no workspace). */
    isDefault?: boolean;
  } | null;
  handler: ConversationHandler;
  openRequest: { id: string; replyId: string | null; kind: string; status: string; createdAt: string } | null;
  lastOutboundAt: string | null;
  ownerId: string;
  workspaceId: string | null;
  grounding: { summary: string; offer: string; bookingUrl: string | null; companyName: string };
}

/** The run's first offer, as one line for the agent. */
export function runOfferLine(offers: unknown): string {
  const list = Array.isArray(offers) ? offers : [];
  const first = list[0] as { title?: string; valueProp?: string } | undefined;
  if (!first) return "";
  return [first.title, first.valueProp].filter((s) => String(s ?? "").trim()).join(": ");
}

/** Summary, offer, booking link and company name the agent may use. */
export function groundingInputs(input: {
  campaign: { agentOffer?: string | null } | null;
  run: { businessOverview?: any; offers?: any; bookingUrl?: string | null; companyName?: string | null } | null;
  settings: {
    companySummary?: string | null;
    mainOffer?: string | null;
    bookingUrl?: string | null;
    companyName?: string | null;
  } | null;
  fallbackCompanyName?: string | null;
}): ConversationContext["grounding"] {
  const overview = (input.run?.businessOverview ?? {}) as { summary?: string };
  return {
    summary: String(overview.summary || input.settings?.companySummary || "").trim(),
    offer: String(input.campaign?.agentOffer || runOfferLine(input.run?.offers) || input.settings?.mainOffer || "").trim(),
    bookingUrl: (input.run?.bookingUrl || input.settings?.bookingUrl || "").trim() || null,
    companyName: String(
      input.run?.companyName || input.settings?.companyName || input.fallbackCompanyName || "",
    ).trim(),
  };
}

/** Effective handling for a loaded context. */
export function conversationEffective(ctx: ConversationContext): EffectiveConversation {
  return resolveConversationMode({
    campaignSetting: ctx.campaign.leadConversationMode ?? "manual",
    workspaceDefault: ctx.settings?.leadConversationMode ?? "manual",
    agentPaused: ctx.settings?.agentPaused ?? false,
    handler: ctx.handler,
    grounding: groundingFor(ctx.grounding),
  });
}

/** Open (or sending) Needs you request for this conversation, newest first. */
export async function findOpenConversationRequest(
  db: EngineDb,
  input: { leadId: string | null; campaignId: string | null; replyId?: string | null },
): Promise<ConversationContext["openRequest"]> {
  const where =
    input.leadId && input.campaignId
      ? and(
          eq(schema.agentRequests.leadId, input.leadId),
          eq(schema.agentRequests.campaignId, input.campaignId),
          inArray(schema.agentRequests.status, [...OPEN_REQUEST_STATUSES]),
        )
      : input.replyId
        ? and(eq(schema.agentRequests.replyId, input.replyId), inArray(schema.agentRequests.status, [...OPEN_REQUEST_STATUSES]))
        : null;
  if (!where) return null;
  const rows: any[] = await db
    .select({
      id: schema.agentRequests.id,
      replyId: schema.agentRequests.replyId,
      kind: schema.agentRequests.kind,
      status: schema.agentRequests.status,
      createdAt: schema.agentRequests.createdAt,
    })
    .from(schema.agentRequests)
    .where(where)
    .orderBy(desc(schema.agentRequests.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Everything that decides who answers one lead in one campaign. Null when the campaign is gone. */
export async function loadConversationContext(
  db: EngineDb,
  input: { leadId: string | null; campaignId: string | null },
): Promise<ConversationContext | null> {
  if (!input.campaignId) return null;
  const [campaign]: any[] = await db
    .select({
      id: schema.campaigns.id,
      userId: schema.campaigns.userId,
      workspaceId: schema.campaigns.workspaceId,
      status: schema.campaigns.status,
      deletedAt: schema.campaigns.deletedAt,
      leadConversationMode: schema.campaigns.leadConversationMode,
      agentOffer: schema.campaigns.agentOffer,
    })
    .from(schema.campaigns)
    .where(eq(schema.campaigns.id, input.campaignId))
    .limit(1);
  if (!campaign) return null;

  const [run]: any[] = await db
    .select({
      id: schema.chadGtmRuns.id,
      userId: schema.chadGtmRuns.userId,
      workspaceId: schema.chadGtmRuns.workspaceId,
      companyName: schema.chadGtmRuns.companyName,
      bookingUrl: schema.chadGtmRuns.bookingUrl,
      businessOverview: schema.chadGtmRuns.businessOverview,
      offers: schema.chadGtmRuns.offers,
    })
    .from(schema.chadGtmRuns)
    .where(eq(schema.chadGtmRuns.campaignId, input.campaignId))
    .limit(1);

  const ownerId: string = run?.userId || campaign.userId;
  const workspaceId: string | null = campaign.workspaceId ?? run?.workspaceId ?? null;

  const settingsCols = {
    id: schema.workspaces.id,
    leadConversationMode: schema.workspaces.leadConversationMode,
    agentPaused: schema.workspaces.agentPaused,
    companySummary: schema.workspaces.companySummary,
    mainOffer: schema.workspaces.mainOffer,
    bookingUrl: schema.workspaces.bookingUrl,
    companyName: schema.workspaces.companyName,
    isDefault: schema.workspaces.isDefault,
  };
  const [settings]: any[] = workspaceId
    ? await db.select(settingsCols).from(schema.workspaces).where(eq(schema.workspaces.id, workspaceId)).limit(1)
    : await db
        .select(settingsCols)
        .from(schema.workspaces)
        .where(eq(schema.workspaces.userId, ownerId))
        .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt)
        .limit(1);

  let fallbackCompanyName = "";
  if (!run?.companyName && !settings?.companyName) {
    const [ws]: any[] = await db
      .select({ companyName: schema.workspaceSettings.companyName })
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, ownerId))
      .limit(1);
    fallbackCompanyName = ws?.companyName || "";
  }

  let handler: ConversationHandler = "campaign";
  let lastOutboundAt: string | null = null;
  if (input.leadId) {
    const [row]: any[] = await db
      .select({ handler: schema.leadConversations.handler })
      .from(schema.leadConversations)
      .where(
        and(eq(schema.leadConversations.leadId, input.leadId), eq(schema.leadConversations.campaignId, input.campaignId)),
      )
      .limit(1);
    if (row?.handler === "you") handler = "you";

    const [last]: any[] = await db
      .select({ lastOutboundAt: sql<string | null>`max(${schema.uniboxMessages.sentAt})` })
      .from(schema.uniboxMessages)
      .where(
        and(
          eq(schema.uniboxMessages.leadId, input.leadId),
          eq(schema.uniboxMessages.campaignId, input.campaignId),
          eq(schema.uniboxMessages.direction, "operator"),
        ),
      );
    lastOutboundAt = last?.lastOutboundAt ?? null;
  }
  const openRequest = await findOpenConversationRequest(db, { leadId: input.leadId, campaignId: input.campaignId });

  return {
    campaign: {
      id: campaign.id,
      userId: campaign.userId,
      workspaceId: campaign.workspaceId ?? null,
      status: campaign.status,
      deletedAt: campaign.deletedAt ?? null,
      leadConversationMode: campaign.leadConversationMode ?? "manual",
      agentOffer: campaign.agentOffer ?? "",
    },
    run: run
      ? {
          id: run.id,
          userId: run.userId,
          workspaceId: run.workspaceId ?? null,
          companyName: run.companyName ?? "",
          bookingUrl: run.bookingUrl ?? null,
          businessOverview: run.businessOverview ?? {},
          offers: run.offers ?? [],
        }
      : null,
    settings: settings
      ? {
          id: settings.id,
          leadConversationMode: settings.leadConversationMode ?? "manual",
          agentPaused: Boolean(settings.agentPaused),
          companySummary: settings.companySummary ?? "",
          mainOffer: settings.mainOffer ?? "",
          bookingUrl: settings.bookingUrl ?? null,
          companyName: settings.companyName ?? "",
          // Without a campaign/run workspace the row is the owner's default workspace.
          isDefault: workspaceId ? Boolean(settings.isDefault) : true,
        }
      : null,
    handler,
    openRequest,
    lastOutboundAt,
    ownerId,
    workspaceId,
    grounding: groundingInputs({ campaign, run: run ?? null, settings: settings ?? null, fallbackCompanyName }),
  };
}

/* ─── Writes ──────────────────────────────────────────────────────────── */

/** Point an open Needs you card at the lead's newest message. */
export async function attachReplyToOpenRequest(
  db: EngineDb,
  requestId: string,
  replyId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await db
    .update(schema.agentRequests)
    .set({ replyId, updatedAt: nowIso })
    .where(and(eq(schema.agentRequests.id, requestId), inArray(schema.agentRequests.status, [...OPEN_REQUEST_STATUSES])));
}

/** Set who handles a conversation (upsert on lead + campaign). */
export async function setConversationHandler(
  db: EngineDb,
  input: {
    userId: string;
    workspaceId: string | null;
    leadId: string;
    campaignId: string;
    handler: ConversationHandler;
    reason: ConversationHandlerReason;
    nowIso?: string;
  },
): Promise<void> {
  const now = input.nowIso ?? new Date().toISOString();
  await db
    .insert(schema.leadConversations)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      campaignId: input.campaignId,
      handler: input.handler,
      handlerReason: input.reason,
      handlerChangedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.leadConversations.leadId, schema.leadConversations.campaignId],
      set: { handler: input.handler, handlerReason: input.reason, handlerChangedAt: now, updatedAt: now },
    });
}

/* ─── Inbound (sync) ──────────────────────────────────────────────────── */

export interface InboundAgentDecision {
  agentStatus: "pending" | "skipped" | "escalated" | null;
  agentIntent?: string;
  agentSummary?: string;
  /** Open Needs you card the new message joins. */
  attachToRequestId?: string;
}

/**
 * Agent status for a new lead message. Null (a person answers from the Inbox)
 * when there is no campaign, the conversation is handled by you, or anything
 * fails to load: nobody auto-answers when in doubt.
 */
export async function decideInboundAgentStatus(
  db: EngineDb,
  input: {
    campaignId: string | null;
    leadId: string | null;
    autoReplyAuto: boolean;
    autoReason?: string | null;
    classifiedTag?: string | null;
  },
): Promise<InboundAgentDecision> {
  if (!input.campaignId) return { agentStatus: null };
  let ctx: ConversationContext | null;
  try {
    ctx = await loadConversationContext(db, { leadId: input.leadId, campaignId: input.campaignId });
  } catch {
    return { agentStatus: null };
  }
  if (!ctx) return { agentStatus: null };
  if (conversationEffective(ctx).handledBy === "you") return { agentStatus: null };
  if (input.autoReplyAuto) {
    return {
      agentStatus: "skipped",
      agentIntent: "out_of_office",
      agentSummary: `Automatic reply (${input.autoReason || "auto-reply headers"}); the agent does not answer auto-replies.`,
    };
  }
  if (input.classifiedTag === "out_of_office") {
    return { agentStatus: "skipped", agentIntent: "out_of_office", agentSummary: OUT_OF_OFFICE_SUMMARY };
  }
  if (ctx.openRequest) {
    return {
      agentStatus: "escalated",
      agentIntent: "other",
      agentSummary: WAITING_ON_YOU_SUMMARY,
      attachToRequestId: ctx.openRequest.id,
    };
  }
  return { agentStatus: "pending" };
}

/* ─── Pre-send re-check (reply agent) ─────────────────────────────────── */

export interface OwnershipCheck {
  /** First blocker when the agent would send a reply. */
  blocker: PreSendBlocker | null;
  /** First blocker when the agent would open a Needs you card instead. */
  escalateBlocker: PreSendBlocker | null;
  effective: EffectiveConversation | null;
  ctx: ConversationContext | null;
}

/**
 * Re-read everything right before the agent acts: the reply must still be
 * claimed by this tick, and the conversation must still be the agent's, not
 * answered since, not waiting on you, not opted out, the campaign running,
 * the owner approved and the mailbox usable. Throws on a read error (the tick
 * retries; nothing is sent).
 */
export async function confirmStillOwned(
  db: EngineDb,
  input: {
    replyId: string;
    claimedAt: string;
    leadId: string | null;
    campaignId: string | null;
    fromEmail: string;
    senderId: string;
  },
): Promise<OwnershipCheck> {
  const [row]: any[] = await db
    .select({
      agentStatus: schema.replies.agentStatus,
      agentClaimedAt: schema.replies.agentClaimedAt,
      receivedAt: schema.replies.receivedAt,
    })
    .from(schema.replies)
    .where(eq(schema.replies.id, input.replyId))
    .limit(1);
  if (!row || row.agentStatus !== "processing" || row.agentClaimedAt !== input.claimedAt) {
    return { blocker: "claim_lost", escalateBlocker: "claim_lost", effective: null, ctx: null };
  }
  const ctx = await loadConversationContext(db, { leadId: input.leadId, campaignId: input.campaignId });
  const effective: EffectiveConversation = ctx
    ? conversationEffective(ctx)
    : resolveConversationMode({ campaignSetting: null, grounding: groundingFor({}) });
  const ownerId = ctx?.ownerId ?? "";
  const suppressed = ownerId ? await isSuppressedFor(db, ownerId, input.fromEmail) : true;
  const ownerApproved = ownerId ? !(await loadUnapprovedOwners(db, [ownerId])).has(ownerId) : false;
  const [sender]: any[] = await db
    .select({ status: schema.senderAccounts.status, deletedAt: schema.senderAccounts.deletedAt })
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, input.senderId))
    .limit(1);
  const base = {
    effective,
    reply: { agentStatus: row.agentStatus, agentClaimedAt: row.agentClaimedAt, receivedAt: row.receivedAt },
    claimedAt: input.claimedAt,
    ctx: {
      campaign: ctx?.campaign ?? null,
      openRequest: ctx?.openRequest ?? null,
      lastOutboundAt: ctx?.lastOutboundAt ?? null,
    },
    suppressed,
    ownerApproved,
    senderUsable: isSenderUsable(sender),
  };
  return {
    blocker: preSendBlockers({ ...base, action: "reply" }),
    escalateBlocker: preSendBlockers({ ...base, action: "escalate" }),
    effective,
    ctx,
  };
}

/**
 * The agent commits to sending, in one conditional UPDATE on its own claim.
 * False means a person took the reply ("Send mine") meanwhile: do not send.
 * A person's forced claim refuses once this is written (see the web app's
 * claimReplyForHuman), so exactly one of the two emails can go out.
 */
export async function markAgentSending(db: EngineDb, input: { replyId: string; claimedAt: string }): Promise<boolean> {
  const rows: any[] = await db
    .update(schema.replies)
    .set({ agentStatus: "processing", agentSummary: AGENT_SENDING_SUMMARY })
    .where(
      and(
        eq(schema.replies.id, input.replyId),
        eq(schema.replies.agentStatus, "processing"),
        eq(schema.replies.agentClaimedAt, input.claimedAt),
      ),
    )
    .returning({ id: schema.replies.id });
  return rows.length > 0;
}

/** Replies the agent should treat as unanswered by a person (used by the web app's bookkeeping). */
export const HUMAN_CLEARABLE_AGENT_STATUSES = ["pending", "escalated", "held", "skipped", "failed"] as const;

/** Is this reply row's agent status one a person's send clears? (null rows are not agent-managed.) */
export function isHumanClearable(status: string | null | undefined): boolean {
  return (HUMAN_CLEARABLE_AGENT_STATUSES as readonly string[]).includes(String(status));
}

/**
 * Server-side "Lead conversations" helpers for the Inbox and Needs you:
 * who handles each conversation (batch), the atomic claim a person's send
 * takes on a reply, and the bookkeeping after a person answers.
 *
 * The policy itself (resolveConversationMode) lives in the engine so the web
 * app and the reply agent can never disagree.
 */
import { and, asc, desc, eq, gt, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import {
  AGENT_SENDING_SUMMARY,
  HUMAN_CLEARABLE_AGENT_STATUSES,
  HUMAN_REPLIED_SUMMARY,
  OPEN_REQUEST_STATUSES,
  TAKEN_OVER_SUMMARY,
  groundingFor,
  groundingInputs,
  resolveConversationMode,
  setConversationHandler,
  suppressedEmails,
  type ConversationModeReason,
  type GroundingGap,
  type HandledBy,
  type LeadConversationMode,
} from "@smartreach/email-engine/lead-conversations";
import { uniboxConversationKey } from "./unibox-conversations";
import { getDb, type Db } from "./db";
import {
  isLeadConversationMode,
  modeFromRun,
  runModeFor,
  type LeadConversationState,
  type RunReplyMode,
} from "./lead-conversations";

// Server code passes the app's Drizzle client; tests pass a fake.
type AnyDb = Db | any;

export interface ConversationHandlerView {
  handledBy: HandledBy;
  reason: ConversationModeReason;
  /** Taken over by you, and the campaign would hand it to the agent again. */
  canHandBack: boolean;
  openRequestId: string | null;
  downgraded: boolean;
  missing: GroundingGap[];
}

export function conversationKey(leadId: string | null | undefined, campaignId: string | null | undefined): string {
  return `${leadId ?? ""}\u0000${campaignId ?? ""}`;
}

const NO_CAMPAIGN: ConversationHandlerView = {
  handledBy: "you",
  reason: "no_campaign",
  canHandBack: false,
  openRequestId: null,
  downgraded: false,
  missing: [],
};

/**
 * Who handles each (lead, campaign) conversation, in a fixed number of
 * queries. Keyed by conversationKey(leadId, campaignId).
 */
export async function loadConversationHandlers(
  db: AnyDb,
  userId: string,
  rows: ReadonlyArray<{ leadId: string | null; campaignId: string | null }>,
): Promise<Map<string, ConversationHandlerView>> {
  const out = new Map<string, ConversationHandlerView>();
  const campaignIds = [...new Set(rows.map((r) => r.campaignId).filter((id): id is string => Boolean(id)))];
  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((id): id is string => Boolean(id)))];
  if (campaignIds.length === 0) {
    for (const r of rows) out.set(conversationKey(r.leadId, r.campaignId), NO_CAMPAIGN);
    return out;
  }

  const campaigns: any[] = await db
    .select({
      id: schema.campaigns.id,
      userId: schema.campaigns.userId,
      workspaceId: schema.campaigns.workspaceId,
      leadConversationMode: schema.campaigns.leadConversationMode,
      agentOffer: schema.campaigns.agentOffer,
    })
    .from(schema.campaigns)
    .where(and(inArray(schema.campaigns.id, campaignIds), eq(schema.campaigns.userId, userId)));
  const runs: any[] = await db
    .select({
      campaignId: schema.chadGtmRuns.campaignId,
      bookingUrl: schema.chadGtmRuns.bookingUrl,
      businessOverview: schema.chadGtmRuns.businessOverview,
      offers: schema.chadGtmRuns.offers,
      companyName: schema.chadGtmRuns.companyName,
    })
    .from(schema.chadGtmRuns)
    .where(inArray(schema.chadGtmRuns.campaignId, campaignIds));
  const workspaces: any[] = await db
    .select({
      id: schema.workspaces.id,
      isDefault: schema.workspaces.isDefault,
      createdAt: schema.workspaces.createdAt,
      leadConversationMode: schema.workspaces.leadConversationMode,
      agentPaused: schema.workspaces.agentPaused,
      companySummary: schema.workspaces.companySummary,
      mainOffer: schema.workspaces.mainOffer,
      bookingUrl: schema.workspaces.bookingUrl,
    })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, userId));
  const handlers: any[] = leadIds.length
    ? await db
        .select({
          leadId: schema.leadConversations.leadId,
          campaignId: schema.leadConversations.campaignId,
          handler: schema.leadConversations.handler,
        })
        .from(schema.leadConversations)
        .where(
          and(inArray(schema.leadConversations.campaignId, campaignIds), inArray(schema.leadConversations.leadId, leadIds)),
        )
    : [];
  const requests: any[] = await db
    .select({
      id: schema.agentRequests.id,
      leadId: schema.agentRequests.leadId,
      campaignId: schema.agentRequests.campaignId,
      createdAt: schema.agentRequests.createdAt,
    })
    .from(schema.agentRequests)
    .where(
      and(
        eq(schema.agentRequests.userId, userId),
        inArray(schema.agentRequests.status, [...OPEN_REQUEST_STATUSES]),
        inArray(schema.agentRequests.campaignId, campaignIds),
      ),
    );

  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const runByCampaign = new Map(runs.map((r) => [r.campaignId, r]));
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
  const fallbackWorkspace =
    [...workspaces].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(a.createdAt).localeCompare(String(b.createdAt)))[0] ??
    null;
  const handlerByKey = new Map(handlers.map((h) => [conversationKey(h.leadId, h.campaignId), h.handler]));
  const requestByKey = new Map<string, string>();
  for (const r of [...requests].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
    const key = conversationKey(r.leadId, r.campaignId);
    if (!requestByKey.has(key)) requestByKey.set(key, r.id);
  }

  for (const row of rows) {
    const key = conversationKey(row.leadId, row.campaignId);
    if (out.has(key)) continue;
    const campaign = row.campaignId ? campaignById.get(row.campaignId) : undefined;
    if (!campaign) {
      out.set(key, NO_CAMPAIGN);
      continue;
    }
    const run = runByCampaign.get(campaign.id) ?? null;
    const settings = (campaign.workspaceId ? workspaceById.get(campaign.workspaceId) : fallbackWorkspace) ?? null;
    const grounding = groundingFor(groundingInputs({ campaign, run, settings }));
    const handler = row.leadId ? (handlerByKey.get(key) ?? "campaign") : "campaign";
    const input = {
      campaignSetting: campaign.leadConversationMode ?? "manual",
      workspaceDefault: settings?.leadConversationMode ?? "manual",
      agentPaused: settings?.agentPaused ?? false,
      grounding,
    };
    const effective = resolveConversationMode({ ...input, handler });
    const withoutTakeOver = handler === "you" ? resolveConversationMode({ ...input, handler: "campaign" }) : effective;
    out.set(key, {
      handledBy: effective.handledBy,
      reason: effective.reason,
      canHandBack: handler === "you" && withoutTakeOver.handledBy !== "you",
      openRequestId: requestByKey.get(key) ?? null,
      downgraded: effective.downgraded,
      missing: effective.missing,
    });
  }
  return out;
}

/* ─── A person's send ─────────────────────────────────────────────────── */

export type HumanClaim = { ok: true } | { ok: false; current: string | null; agentSending?: boolean };

/**
 * Take the reply for a person's send: one conditional UPDATE on the status
 * that was read. While the agent holds it ('processing') this refuses unless
 * `force` (the person confirmed "Send mine"), which makes the agent's
 * pre-send check fail so it never sends. Once the agent has committed to
 * sending (AGENT_SENDING_SUMMARY), even a forced claim is refused: the lead
 * never gets both emails.
 */
export async function claimReplyForHuman(
  db: AnyDb,
  input: { userId: string; replyId: string; previous: string | null; force?: boolean; nowIso: string },
): Promise<HumanClaim> {
  if (input.previous === "processing" && !input.force) return { ok: false, current: "processing" };
  const rows: any[] = await db
    .update(schema.replies)
    .set({ agentStatus: "human_replied", agentHandledAt: input.nowIso })
    .where(
      and(
        eq(schema.replies.id, input.replyId),
        eq(schema.replies.userId, input.userId),
        input.previous == null ? isNull(schema.replies.agentStatus) : eq(schema.replies.agentStatus, input.previous as any),
        input.previous === "processing"
          ? or(isNull(schema.replies.agentSummary), ne(schema.replies.agentSummary, AGENT_SENDING_SUMMARY))
          : undefined,
      ),
    )
    .returning({ id: schema.replies.id });
  if (rows.length > 0) return { ok: true };
  const [row]: any[] = await db
    .select({ agentStatus: schema.replies.agentStatus })
    .from(schema.replies)
    .where(and(eq(schema.replies.id, input.replyId), eq(schema.replies.userId, input.userId)))
    .limit(1);
  const current = row?.agentStatus ?? null;
  // A forced claim on a reply still 'processing' fails only once the agent is sending.
  const agentSending = input.force === true && input.previous === "processing" && current === "processing";
  return { ok: false, current, ...(agentSending ? { agentSending } : {}) };
}

/** The send failed: put the reply back where it was (the agent retries a reply it was drafting). */
export async function releaseHumanClaim(db: AnyDb, input: { replyId: string; previous: string | null }): Promise<void> {
  const restore = input.previous === "processing" ? "pending" : input.previous;
  await db
    .update(schema.replies)
    .set({ agentStatus: restore as any })
    .where(and(eq(schema.replies.id, input.replyId), eq(schema.replies.agentStatus, "human_replied")));
}

/**
 * A lead message in the same Inbox conversation that arrived after `since`
 * (the newest message the person saw), or null.
 */
export async function newerReplyInConversation(
  db: AnyDb,
  userId: string,
  reply: { id: string; leadId: string | null; campaignId: string | null; fromEmail: string; subject: string | null },
  since: string,
): Promise<{ id: string; fromName: string; fromEmail: string } | null> {
  const rows: any[] = await db
    .select({
      id: schema.replies.id,
      leadId: schema.replies.leadId,
      campaignId: schema.replies.campaignId,
      fromName: schema.replies.fromName,
      fromEmail: schema.replies.fromEmail,
      subject: schema.replies.subject,
      receivedAt: schema.replies.receivedAt,
    })
    .from(schema.replies)
    .where(
      and(
        eq(schema.replies.userId, userId),
        reply.leadId ? eq(schema.replies.leadId, reply.leadId) : eq(schema.replies.fromEmail, reply.fromEmail),
        reply.campaignId ? eq(schema.replies.campaignId, reply.campaignId) : isNull(schema.replies.campaignId),
        gt(schema.replies.receivedAt, since),
      ),
    )
    .limit(20);
  const key = uniboxConversationKey({ ...reply, subject: reply.subject ?? "" });
  const hit = rows.find((r) => r.id !== reply.id && uniboxConversationKey({ ...r, subject: r.subject ?? "" }) === key);
  return hit ? { id: hit.id, fromName: hit.fromName ?? "", fromEmail: hit.fromEmail } : null;
}

/**
 * Did the lead, a teammate or the agent write in this conversation after
 * `since`? Used before sending a reply drafted earlier (Needs you).
 */
export async function conversationActivitySince(
  db: AnyDb,
  userId: string,
  input: { leadId: string | null; campaignId: string | null; replyId: string; since: string },
): Promise<boolean> {
  const inbound: any[] =
    input.leadId && input.campaignId
      ? await db
          .select({ id: schema.replies.id })
          .from(schema.replies)
          .where(
            and(
              eq(schema.replies.userId, userId),
              eq(schema.replies.leadId, input.leadId),
              eq(schema.replies.campaignId, input.campaignId),
              gt(schema.replies.receivedAt, input.since),
            ),
          )
          .limit(1)
      : [];
  if (inbound.length > 0) return true;
  const outbound: any[] = await db
    .select({ id: schema.uniboxMessages.id })
    .from(schema.uniboxMessages)
    .where(
      and(
        input.leadId && input.campaignId
          ? and(eq(schema.uniboxMessages.leadId, input.leadId), eq(schema.uniboxMessages.campaignId, input.campaignId))
          : eq(schema.uniboxMessages.replyId, input.replyId),
        eq(schema.uniboxMessages.direction, "operator"),
        gt(schema.uniboxMessages.sentAt, input.since),
      ),
    )
    .limit(1);
  return outbound.length > 0;
}

/**
 * After a person answered a lead: every reply in the conversation the agent
 * still had open becomes 'human_replied' (or 'replied' for an approved draft), every open Needs you card for it
 * is resolved, and (takeOver) the conversation becomes "Handled by: You".
 */
export async function recordHumanSend(
  db: AnyDb,
  input: {
    userId: string;
    workspaceId: string | null;
    leadId: string | null;
    campaignId: string | null;
    replyId: string;
    takeOver: boolean;
    nowIso: string;
    summary?: string;
    resolution?: string;
    /** 'replied' when the send was an agent draft you approved unchanged. */
    agentStatus?: "human_replied" | "replied";
  },
): Promise<void> {
  const conversation = input.leadId && input.campaignId ? { leadId: input.leadId, campaignId: input.campaignId } : null;
  await db
    .update(schema.replies)
    .set({
      agentStatus: input.agentStatus ?? "human_replied",
      agentSummary: input.summary ?? HUMAN_REPLIED_SUMMARY,
      agentHandledAt: input.nowIso,
      readAt: input.nowIso,
    })
    .where(
      and(
        eq(schema.replies.userId, input.userId),
        conversation
          ? or(
              eq(schema.replies.id, input.replyId),
              and(
                eq(schema.replies.leadId, conversation.leadId),
                eq(schema.replies.campaignId, conversation.campaignId),
                inArray(schema.replies.agentStatus, [...HUMAN_CLEARABLE_AGENT_STATUSES]),
              ),
            )
          : eq(schema.replies.id, input.replyId),
      ),
    );
  await db
    .update(schema.agentRequests)
    .set({
      status: "resolved",
      resolution: input.resolution ?? "Answered in the Inbox",
      resolvedAt: input.nowIso,
      updatedAt: input.nowIso,
    })
    .where(
      and(
        eq(schema.agentRequests.userId, input.userId),
        inArray(schema.agentRequests.status, [...OPEN_REQUEST_STATUSES]),
        conversation
          ? or(
              eq(schema.agentRequests.replyId, input.replyId),
              and(
                eq(schema.agentRequests.leadId, conversation.leadId),
                eq(schema.agentRequests.campaignId, conversation.campaignId),
              ),
            )
          : eq(schema.agentRequests.replyId, input.replyId),
      ),
    );
  if (input.takeOver && conversation) {
    await setConversationHandler(db, {
      userId: input.userId,
      workspaceId: input.workspaceId,
      leadId: conversation.leadId,
      campaignId: conversation.campaignId,
      handler: "you",
      reason: "send",
      nowIso: input.nowIso,
    });
  }
}

export const TAKEN_OVER_RESOLUTION = "Closed: you took over this conversation.";

/**
 * "Take over" ends the wait like dismissing the card does: every open Needs
 * you card for the conversation closes (nothing is sent), and the lead's
 * messages waiting on the agent or on a card become yours to answer in the Inbox.
 * A card whose send is in flight ('sending') is left to that send.
 */
export async function closeConversationRequestsOnTakeOver(
  db: AnyDb,
  input: { userId: string; leadId: string; campaignId: string; nowIso: string },
): Promise<number> {
  const closed: any[] = await db
    .update(schema.agentRequests)
    .set({ status: "dismissed", resolution: TAKEN_OVER_RESOLUTION, resolvedAt: input.nowIso, updatedAt: input.nowIso })
    .where(
      and(
        eq(schema.agentRequests.userId, input.userId),
        eq(schema.agentRequests.leadId, input.leadId),
        eq(schema.agentRequests.campaignId, input.campaignId),
        eq(schema.agentRequests.status, "open"),
      ),
    )
    .returning({ id: schema.agentRequests.id });
  await db
    .update(schema.replies)
    .set({ agentStatus: "skipped", agentIntent: "manual", agentSummary: TAKEN_OVER_SUMMARY, agentHandledAt: input.nowIso })
    .where(
      and(
        eq(schema.replies.userId, input.userId),
        eq(schema.replies.leadId, input.leadId),
        eq(schema.replies.campaignId, input.campaignId),
        // 'held' stays: it says why nothing can be sent yet (account on hold).
        inArray(schema.replies.agentStatus, ["pending", "escalated"]),
      ),
    );
  return closed.length;
}

/* ─── Workspace settings and per-campaign state ───────────────────────── */

/** The workspace's "Lead conversations" settings (defaults when there is no row). */
export interface WorkspaceLeadSettings {
  workspaceId: string | null;
  defaultMode: LeadConversationMode;
  agentPaused: boolean;
  bookingUrl: string | null;
  companySummary: string;
  mainOffer: string;
  notifyEmail: string;
}

const NO_WORKSPACE_SETTINGS: WorkspaceLeadSettings = {
  workspaceId: null,
  defaultMode: "manual",
  agentPaused: false,
  bookingUrl: null,
  companySummary: "",
  mainOffer: "",
  notifyEmail: "",
};

const WORKSPACE_SETTING_COLUMNS = {
  id: schema.workspaces.id,
  leadConversationMode: schema.workspaces.leadConversationMode,
  agentPaused: schema.workspaces.agentPaused,
  bookingUrl: schema.workspaces.bookingUrl,
  companySummary: schema.workspaces.companySummary,
  mainOffer: schema.workspaces.mainOffer,
  notifyEmail: schema.workspaces.notifyEmail,
};

function toWorkspaceSettings(row: any): WorkspaceLeadSettings {
  if (!row) return NO_WORKSPACE_SETTINGS;
  return {
    workspaceId: row.id ?? null,
    defaultMode: isLeadConversationMode(row.leadConversationMode) ? row.leadConversationMode : "manual",
    agentPaused: Boolean(row.agentPaused),
    bookingUrl: row.bookingUrl || null,
    companySummary: row.companySummary ?? "",
    mainOffer: row.mainOffer ?? "",
    notifyEmail: row.notifyEmail ?? "",
  };
}

/** Settings of `workspaceId` (owned by the user), else the user's default (or oldest) workspace. */
export async function loadWorkspaceLeadSettings(
  db: AnyDb,
  userId: string,
  workspaceId: string | null,
): Promise<WorkspaceLeadSettings> {
  const [row]: any[] = workspaceId
    ? await db
        .select(WORKSPACE_SETTING_COLUMNS)
        .from(schema.workspaces)
        .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, userId)))
        .limit(1)
    : await db
        .select(WORKSPACE_SETTING_COLUMNS)
        .from(schema.workspaces)
        .where(eq(schema.workspaces.userId, userId))
        .orderBy(desc(schema.workspaces.isDefault), asc(schema.workspaces.createdAt))
        .limit(1);
  return toWorkspaceSettings(row);
}

/** True once someone saved anything under Settings › Lead conversations. */
export function workspaceSettingsConfigured(s: WorkspaceLeadSettings): boolean {
  return (
    s.defaultMode !== "manual" ||
    s.agentPaused ||
    Boolean(s.bookingUrl) ||
    Boolean(s.companySummary.trim()) ||
    Boolean(s.mainOffer.trim())
  );
}

/**
 * Reply mode for a new Autopilot run: the workspace default once the
 * workspace has Lead conversations settings, otherwise Agent (what Autopilot
 * runs always started with).
 */
export async function initialRunReplyMode(db: AnyDb, userId: string, workspaceId: string | null): Promise<RunReplyMode> {
  try {
    const settings = await loadWorkspaceLeadSettings(db, userId, workspaceId);
    return workspaceSettingsConfigured(settings) ? runModeFor(settings.defaultMode) : "autopilot";
  } catch {
    return "autopilot";
  }
}

function stateFrom(input: {
  target: LeadConversationState["target"];
  setting: LeadConversationState["setting"];
  settings: WorkspaceLeadSettings;
  campaign: { agentOffer?: string | null; status?: string | null } | null;
  run: { businessOverview?: any; offers?: any; bookingUrl?: string | null; companyName?: string | null } | null;
}): LeadConversationState {
  const grounding = groundingFor(
    groundingInputs({
      campaign: input.campaign,
      run: input.run,
      settings: {
        companySummary: input.settings.companySummary,
        mainOffer: input.settings.mainOffer,
        bookingUrl: input.settings.bookingUrl,
      },
    }),
  );
  const effective = resolveConversationMode({
    campaignSetting: input.setting,
    workspaceDefault: input.settings.defaultMode,
    agentPaused: input.settings.agentPaused,
    handler: "campaign",
    grounding,
  });
  return {
    target: input.target,
    setting: input.setting,
    effective: {
      mode: effective.mode,
      handledBy: effective.handledBy,
      reason: effective.reason,
      downgraded: effective.downgraded,
      missing: effective.missing,
    },
    workspaceDefault: input.settings.defaultMode,
    agentPaused: input.settings.agentPaused,
    grounding: { complete: grounding.complete, missing: grounding.missing },
    agentOffer: String(input.campaign?.agentOffer ?? ""),
    campaignStatus: input.campaign?.status ?? null,
  };
}

const RUN_GROUNDING_COLUMNS = {
  id: schema.chadGtmRuns.id,
  campaignId: schema.chadGtmRuns.campaignId,
  workspaceId: schema.chadGtmRuns.workspaceId,
  replyAgentMode: schema.chadGtmRuns.replyAgentMode,
  bookingUrl: schema.chadGtmRuns.bookingUrl,
  businessOverview: schema.chadGtmRuns.businessOverview,
  offers: schema.chadGtmRuns.offers,
  companyName: schema.chadGtmRuns.companyName,
};

/** "Lead conversations" for a campaign the user owns, or null. */
export async function loadCampaignConversationState(
  db: AnyDb,
  userId: string,
  campaignId: string,
): Promise<LeadConversationState | null> {
  const [campaign]: any[] = await db
    .select({
      id: schema.campaigns.id,
      workspaceId: schema.campaigns.workspaceId,
      status: schema.campaigns.status,
      deletedAt: schema.campaigns.deletedAt,
      leadConversationMode: schema.campaigns.leadConversationMode,
      agentOffer: schema.campaigns.agentOffer,
    })
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.userId, userId)))
    .limit(1);
  if (!campaign || campaign.deletedAt) return null;
  const [run]: any[] = await db
    .select(RUN_GROUNDING_COLUMNS)
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.campaignId, campaign.id), eq(schema.chadGtmRuns.userId, userId)))
    .limit(1);
  const settings = await loadWorkspaceLeadSettings(db, userId, campaign.workspaceId ?? run?.workspaceId ?? null);
  const setting = campaign.leadConversationMode === "default" || isLeadConversationMode(campaign.leadConversationMode)
    ? campaign.leadConversationMode
    : "manual";
  return stateFrom({
    target: { kind: "campaign", campaignId: campaign.id, runId: run?.id ?? null },
    setting,
    settings,
    campaign,
    run: run ?? null,
  });
}

/**
 * "Lead conversations" for an Autopilot run the user owns: its campaign's
 * state once launched, else the run's own mode (no workspace default).
 */
export async function loadRunConversationState(
  db: AnyDb,
  userId: string,
  runId: string,
): Promise<LeadConversationState | null> {
  const [run]: any[] = await db
    .select(RUN_GROUNDING_COLUMNS)
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.id, runId), eq(schema.chadGtmRuns.userId, userId)))
    .limit(1);
  if (!run) return null;
  if (run.campaignId) {
    const state = await loadCampaignConversationState(db, userId, run.campaignId);
    if (state) return state;
  }
  const settings = await loadWorkspaceLeadSettings(db, userId, run.workspaceId ?? null);
  return stateFrom({
    target: { kind: "run", runId: run.id },
    setting: modeFromRun(run.replyAgentMode),
    settings,
    campaign: null,
    run,
  });
}

/** Used by pages: the campaign's "Lead conversations" state, or null. */
export async function getCampaignLeadConversation(userId: string, campaignId: string): Promise<LeadConversationState | null> {
  try {
    return await loadCampaignConversationState(getDb(), userId, campaignId);
  } catch (err) {
    console.error("[lead-conversations] could not load campaign state", err);
    return null;
  }
}

/* ─── Conversations waiting when the mode changes ─────────────────────── */

/** Mode changes offer to hand over only conversations this recent. */
export const WAITING_WINDOW_DAYS = 7;

export interface WaitingConversation {
  replyId: string;
  leadId: string;
  campaignId: string;
  agentStatus: string | null;
  agentIntent: string | null;
  receivedAt: string;
}

/**
 * A lead message nobody answered because of how the conversation was set:
 * never given to the agent (NULL), skipped because the campaign was Manual,
 * or held (campaign paused, mailbox unusable).
 */
export function isWaitingStatus(agentStatus: string | null | undefined, agentIntent: string | null | undefined): boolean {
  if (agentStatus == null) return true;
  if (agentStatus === "skipped" && agentIntent === "manual") return true;
  if (agentStatus === "escalated" && agentIntent === "held") return true;
  return false;
}

/**
 * Conversations in these campaigns whose newest lead message (last 7 days)
 * is still waiting: nobody wrote after it, the conversation isn't taken over,
 * nothing is waiting on you and the lead hasn't opted out. Also counts open
 * approval drafts (they stay in Needs you).
 */
export async function findWaitingConversations(
  db: AnyDb,
  input: { userId: string; campaignIds: string[]; now?: Date },
): Promise<{ conversations: WaitingConversation[]; openDrafts: number }> {
  const campaignIds = [...new Set(input.campaignIds.filter(Boolean))];
  if (campaignIds.length === 0) return { conversations: [], openDrafts: 0 };
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - WAITING_WINDOW_DAYS * 86_400_000).toISOString();

  const requests: any[] = await db
    .select({ leadId: schema.agentRequests.leadId, campaignId: schema.agentRequests.campaignId, kind: schema.agentRequests.kind })
    .from(schema.agentRequests)
    .where(
      and(
        eq(schema.agentRequests.userId, input.userId),
        inArray(schema.agentRequests.status, [...OPEN_REQUEST_STATUSES]),
        inArray(schema.agentRequests.campaignId, campaignIds),
      ),
    );
  const openDrafts = requests.filter((r) => r.kind === "approval").length;
  const waitingOnYou = new Set(requests.map((r) => conversationKey(r.leadId, r.campaignId)));

  const replies: any[] = await db
    .select({
      id: schema.replies.id,
      leadId: schema.replies.leadId,
      campaignId: schema.replies.campaignId,
      fromEmail: schema.replies.fromEmail,
      receivedAt: schema.replies.receivedAt,
      agentStatus: schema.replies.agentStatus,
      agentIntent: schema.replies.agentIntent,
    })
    .from(schema.replies)
    .where(
      and(
        eq(schema.replies.userId, input.userId),
        inArray(schema.replies.campaignId, campaignIds),
        gte(schema.replies.receivedAt, since),
      ),
    );

  // The newest lead message per conversation decides.
  const latest = new Map<string, any>();
  for (const r of replies) {
    if (!r.leadId || !r.campaignId) continue; // no conversation to hand over
    if (String(r.receivedAt) < since) continue;
    const key = conversationKey(r.leadId, r.campaignId);
    const prev = latest.get(key);
    if (!prev || String(r.receivedAt) > String(prev.receivedAt)) latest.set(key, r);
  }
  const candidates = [...latest.entries()].filter(
    ([key, r]) => !waitingOnYou.has(key) && isWaitingStatus(r.agentStatus, r.agentIntent),
  );
  if (candidates.length === 0) return { conversations: [], openDrafts };

  const leadIds = [...new Set(candidates.map(([, r]) => r.leadId as string))];
  const outbound: any[] = await db
    .select({
      leadId: schema.uniboxMessages.leadId,
      campaignId: schema.uniboxMessages.campaignId,
      lastAt: sql<string | null>`max(${schema.uniboxMessages.sentAt})`,
    })
    .from(schema.uniboxMessages)
    .where(
      and(
        inArray(schema.uniboxMessages.leadId, leadIds),
        inArray(schema.uniboxMessages.campaignId, campaignIds),
        eq(schema.uniboxMessages.direction, "operator"),
      ),
    )
    .groupBy(schema.uniboxMessages.leadId, schema.uniboxMessages.campaignId);
  const lastOutbound = new Map(outbound.map((o) => [conversationKey(o.leadId, o.campaignId), o.lastAt as string | null]));

  const handlers: any[] = await db
    .select({
      leadId: schema.leadConversations.leadId,
      campaignId: schema.leadConversations.campaignId,
      handler: schema.leadConversations.handler,
    })
    .from(schema.leadConversations)
    .where(and(inArray(schema.leadConversations.leadId, leadIds), inArray(schema.leadConversations.campaignId, campaignIds)));
  const takenOver = new Set(handlers.filter((h) => h.handler === "you").map((h) => conversationKey(h.leadId, h.campaignId)));

  const suppressed = await suppressedEmails(
    db,
    input.userId,
    candidates.map(([, r]) => String(r.fromEmail || "")),
  );

  const conversations: WaitingConversation[] = [];
  for (const [key, r] of candidates) {
    if (takenOver.has(key)) continue;
    const out = lastOutbound.get(key);
    // Someone wrote at or after the lead's message (unknown times count as answered).
    if (out && (String(out) >= String(r.receivedAt) || !Number.isFinite(Date.parse(String(out))))) continue;
    if (!r.fromEmail || suppressed.has(r.fromEmail)) continue;
    conversations.push({
      replyId: r.id,
      leadId: r.leadId,
      campaignId: r.campaignId,
      agentStatus: r.agentStatus ?? null,
      agentIntent: r.agentIntent ?? null,
      receivedAt: r.receivedAt,
    });
  }
  return { conversations, openDrafts };
}

/**
 * Give the waiting conversations to the agent: each reply goes back to
 * 'pending' only if its status is still what was read. Sends nothing; the
 * agent then follows the new mode, with all of its pre-send checks.
 */
export async function requeueWaitingConversations(
  db: AnyDb,
  input: { userId: string; campaignIds: string[]; now?: Date },
): Promise<number> {
  const { conversations } = await findWaitingConversations(db, input);
  let requeued = 0;
  for (const c of conversations) {
    const unchanged =
      c.agentStatus == null
        ? isNull(schema.replies.agentStatus)
        : and(
            eq(schema.replies.agentStatus, c.agentStatus as any),
            c.agentIntent == null ? isNull(schema.replies.agentIntent) : eq(schema.replies.agentIntent, c.agentIntent),
          );
    const rows: any[] = await db
      .update(schema.replies)
      .set({ agentStatus: "pending", agentAttempts: 0, agentClaimedAt: null, agentSummary: null })
      .where(and(eq(schema.replies.id, c.replyId), eq(schema.replies.userId, input.userId), unchanged))
      .returning({ id: schema.replies.id });
    requeued += rows.length;
  }
  return requeued;
}

/**
 * Is the agent off for this conversation (Manual, paused, taken over or no
 * campaign)? Answers sent from Needs you then go out as you. Fails closed:
 * when it can't tell, the answer is yours.
 */
export async function conversationAgentOff(
  db: AnyDb,
  userId: string,
  conversation: { leadId: string | null; campaignId: string | null },
): Promise<boolean> {
  if (!conversation.campaignId) return true;
  try {
    const views = await loadConversationHandlers(db, userId, [conversation]);
    const view = views.get(conversationKey(conversation.leadId, conversation.campaignId));
    return !view || view.handledBy === "you";
  } catch {
    return true;
  }
}

/** conversationKey(leadId, campaignId) of every conversation in `rows` where the agent is off. */
export async function agentOffConversations(
  db: AnyDb,
  userId: string,
  rows: ReadonlyArray<{ leadId: string | null; campaignId: string | null }>,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (rows.length === 0) return out;
  let views: Map<string, ConversationHandlerView>;
  try {
    views = await loadConversationHandlers(db, userId, rows);
  } catch {
    for (const r of rows) out.add(conversationKey(r.leadId, r.campaignId));
    return out;
  }
  for (const r of rows) {
    const key = conversationKey(r.leadId, r.campaignId);
    const view = views.get(key);
    if (!r.campaignId || !view || view.handledBy === "you") out.add(key);
  }
  return out;
}

/* ─── Booking link saved: release the cards waiting for it ────────────── */

export const BOOKING_HANDLED_IN_INBOX = "Handled in the Inbox";
export const BOOKING_LINK_SET = "Booking link set";

type BookingRequestRow = {
  id: string;
  replyId: string | null;
  leadId: string | null;
  campaignId: string | null;
};

/**
 * Should the agent still answer this booking-link card? Not when the
 * conversation is yours (taken over, Manual or paused), or when the lead, a
 * teammate or the agent wrote after the message the card is about. Fails
 * closed: when it can't tell, the agent stays out of it.
 */
async function bookingRequestStillWaiting(db: AnyDb, userId: string, req: BookingRequestRow): Promise<boolean> {
  try {
    if (!req.replyId || !req.campaignId) return false;
    const [reply]: any[] = await db
      .select({
        id: schema.replies.id,
        leadId: schema.replies.leadId,
        campaignId: schema.replies.campaignId,
        receivedAt: schema.replies.receivedAt,
        agentStatus: schema.replies.agentStatus,
      })
      .from(schema.replies)
      .where(and(eq(schema.replies.id, req.replyId), eq(schema.replies.userId, userId)))
      .limit(1);
    if (!reply || !reply.receivedAt) return false;
    const conversation = { leadId: reply.leadId ?? req.leadId ?? null, campaignId: reply.campaignId ?? req.campaignId };
    if (await conversationAgentOff(db, userId, conversation)) return false;
    return !(await conversationActivitySince(db, userId, { ...conversation, replyId: reply.id, since: reply.receivedAt }));
  } catch {
    return false;
  }
}

function openBookingRequestsWhere(userId: string, scope: { runId?: string | null; campaignIds?: string[] }) {
  const campaignIds = [...new Set((scope.campaignIds ?? []).filter(Boolean))];
  const target = [
    scope.runId ? eq(schema.agentRequests.runId, scope.runId) : null,
    campaignIds.length > 0 ? inArray(schema.agentRequests.campaignId, campaignIds) : null,
  ].filter((c): c is NonNullable<typeof c> => c != null);
  if (target.length === 0) return null;
  return and(
    eq(schema.agentRequests.userId, userId),
    eq(schema.agentRequests.kind, "booking_url"),
    eq(schema.agentRequests.status, "open"),
    target.length === 1 ? target[0]! : or(...target)!,
  );
}

/** Open booking-link cards (for a run or campaigns) the agent would answer once a link is saved. */
export async function countBookingLinkWaiting(
  db: AnyDb,
  input: { userId: string; runId?: string | null; campaignIds?: string[] },
): Promise<number> {
  const where = openBookingRequestsWhere(input.userId, input);
  if (!where) return 0;
  const rows: BookingRequestRow[] = await db
    .select({
      id: schema.agentRequests.id,
      replyId: schema.agentRequests.replyId,
      leadId: schema.agentRequests.leadId,
      campaignId: schema.agentRequests.campaignId,
    })
    .from(schema.agentRequests)
    .where(where)
    .limit(200);
  let n = 0;
  for (const r of rows) if (await bookingRequestStillWaiting(db, input.userId, r)) n++;
  return n;
}

/**
 * A booking link was saved. Each open "booking link" card is claimed once
 * (open → sending), then closed:
 *  - "Handled in the Inbox" when the conversation is yours or someone wrote
 *    after the lead's message; its reply is left alone.
 *  - "Booking link set" otherwise, and its reply goes back to the agent
 *    (only if it is still 'escalated'), which re-checks everything first.
 * Nothing is sent here. A second save at the same time finds no open card.
 */
export async function releaseBookingLinkRequests(
  db: AnyDb,
  input: { userId: string; runId?: string | null; campaignIds?: string[]; bookingUrl: string; nowIso?: string },
): Promise<{ answered: number; skipped: number }> {
  const result = { answered: 0, skipped: 0 };
  const where = openBookingRequestsWhere(input.userId, input);
  if (!where) return result;
  const rows: BookingRequestRow[] = await db
    .select({
      id: schema.agentRequests.id,
      replyId: schema.agentRequests.replyId,
      leadId: schema.agentRequests.leadId,
      campaignId: schema.agentRequests.campaignId,
    })
    .from(schema.agentRequests)
    .where(where)
    .limit(200);

  for (const req of rows) {
    const now = input.nowIso ?? new Date().toISOString();
    const claimed: any[] = await db
      .update(schema.agentRequests)
      .set({ status: "sending", updatedAt: now })
      .where(
        and(
          eq(schema.agentRequests.id, req.id),
          eq(schema.agentRequests.userId, input.userId),
          eq(schema.agentRequests.status, "open"),
        ),
      )
      .returning({ id: schema.agentRequests.id });
    if (claimed.length === 0) continue; // another save (or a person) took it

    const waiting = await bookingRequestStillWaiting(db, input.userId, req);
    // Close the card first: while it is open the agent would only join it.
    await db
      .update(schema.agentRequests)
      .set({
        status: "resolved",
        resolution: waiting ? BOOKING_LINK_SET : BOOKING_HANDLED_IN_INBOX,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(eq(schema.agentRequests.id, req.id), eq(schema.agentRequests.status, "sending")));
    if (!waiting || !req.replyId) {
      result.skipped++;
      continue;
    }
    const requeued: any[] = await db
      .update(schema.replies)
      .set({ agentStatus: "pending", agentAttempts: 0, agentClaimedAt: null })
      .where(
        and(
          eq(schema.replies.id, req.replyId),
          eq(schema.replies.userId, input.userId),
          eq(schema.replies.agentStatus, "escalated"),
        ),
      )
      .returning({ id: schema.replies.id });
    if (requeued.length > 0) result.answered++;
    else result.skipped++;
  }
  return result;
}

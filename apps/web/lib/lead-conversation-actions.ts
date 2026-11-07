"use server";

/**
 * "Lead conversations": who talks to leads.
 *
 *  Settings › Lead conversations   workspace default, pause, booking link, business profile
 *  campaign / Autopilot run        one stored value per campaign ('default' = workspace)
 *  Inbox                           "Take over" / "Hand back to agent" for one conversation
 *
 * Ownership is checked on every write (campaigns.user_id, chad_gtm_runs.user_id,
 * replies.user_id). Mode changes apply going forward; conversations already
 * waiting are handed to the agent only when the person confirms
 * (applyToWaiting), and nothing is ever sent by these actions.
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { groundingFor, runOfferLine, setConversationHandler } from "@smartreach/email-engine/lead-conversations";
import { nowIso } from "@smartreach/shared";
import { getDb } from "./db";
import { requireUser } from "./session";
import { getActiveWorkspace } from "./workspaces";
import { normalizeClientBookingUrl } from "./booking-links";
import {
  closeConversationRequestsOnTakeOver,
  conversationKey,
  findWaitingConversations,
  loadCampaignConversationState,
  loadConversationHandlers,
  loadRunConversationState,
  loadWorkspaceLeadSettings,
  releaseBookingLinkRequests,
  requeueWaitingConversations,
  type ConversationHandlerView,
  type WorkspaceLeadSettings,
} from "./lead-conversations-server";
import {
  MANUAL_HAND_BACK_ERROR,
  PAUSED_HAND_BACK_ERROR,
  agentNeedsGroundingError,
  effectiveLabel,
  isCampaignSetting,
  isLeadConversationMode,
  runModeFor,
  type CampaignConversationSetting,
  type LeadConversationMode,
  type LeadConversationState,
  type LeadConversationTarget,
} from "./lead-conversations";

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const NOT_IN_CAMPAIGN = "This reply isn't part of a campaign, so there's no agent to hand it to.";

async function loadOwnedConversation(replyId: string, userId: string) {
  const db = getDb();
  const [reply] = await db
    .select({ id: schema.replies.id, leadId: schema.replies.leadId, campaignId: schema.replies.campaignId })
    .from(schema.replies)
    .where(and(eq(schema.replies.id, replyId), eq(schema.replies.userId, userId)))
    .limit(1);
  if (!reply) return null;
  const [campaign] = reply.campaignId
    ? await db
        .select({ id: schema.campaigns.id, workspaceId: schema.campaigns.workspaceId })
        .from(schema.campaigns)
        .where(and(eq(schema.campaigns.id, reply.campaignId), eq(schema.campaigns.userId, userId)))
        .limit(1)
    : [];
  return { reply, campaign: campaign ?? null };
}

function revalidate() {
  revalidatePath("/unibox");
  revalidatePath("/requests");
}

/** "Take over": the agent stays silent in this conversation until handed back. */
export async function takeOverConversationAction(
  input: { replyId: string },
): Promise<Result<{ handler: ConversationHandlerView; closedRequests: number }>> {
  const user = await requireUser();
  const found = await loadOwnedConversation(String(input?.replyId ?? ""), user.id);
  if (!found) return { ok: false, error: "Conversation not found." };
  const { reply, campaign } = found;
  if (!reply.leadId || !campaign) return { ok: false, error: NOT_IN_CAMPAIGN };
  const db = getDb();
  const now = nowIso();
  await setConversationHandler(db, {
    userId: user.id,
    workspaceId: campaign.workspaceId ?? null,
    leadId: reply.leadId,
    campaignId: campaign.id,
    handler: "you",
    reason: "take_over",
    nowIso: now,
  });
  // You own it now: an open Needs you card for it closes (nothing is sent).
  const closed = await closeConversationRequestsOnTakeOver(db, {
    userId: user.id,
    leadId: reply.leadId,
    campaignId: campaign.id,
    nowIso: now,
  });
  const views = await loadConversationHandlers(db, user.id, [{ leadId: reply.leadId, campaignId: campaign.id }]);
  revalidate();
  return {
    ok: true,
    data: { handler: views.get(conversationKey(reply.leadId, campaign.id))!, closedRequests: closed },
    message:
      closed > 0
        ? "You've taken over; the agent won't reply here. Its Needs you card is closed."
        : "You've taken over; the agent won't reply here.",
  };
}

/** "Hand back to agent": the conversation follows its campaign's setting again. */
export async function handBackConversationAction(input: { replyId: string }): Promise<Result<{ handler: ConversationHandlerView }>> {
  const user = await requireUser();
  const found = await loadOwnedConversation(String(input?.replyId ?? ""), user.id);
  if (!found) return { ok: false, error: "Conversation not found." };
  const { reply, campaign } = found;
  if (!reply.leadId || !campaign) return { ok: false, error: NOT_IN_CAMPAIGN };
  const db = getDb();
  const key = conversationKey(reply.leadId, campaign.id);
  const before = (await loadConversationHandlers(db, user.id, [{ leadId: reply.leadId, campaignId: campaign.id }])).get(key);
  if (before && before.handledBy === "you" && !before.canHandBack) {
    return { ok: false, error: before.reason === "paused" ? PAUSED_HAND_BACK_ERROR : MANUAL_HAND_BACK_ERROR };
  }
  await setConversationHandler(db, {
    userId: user.id,
    workspaceId: campaign.workspaceId ?? null,
    leadId: reply.leadId,
    campaignId: campaign.id,
    handler: "campaign",
    reason: "hand_back",
    nowIso: nowIso(),
  });
  const after = (await loadConversationHandlers(db, user.id, [{ leadId: reply.leadId, campaignId: campaign.id }])).get(key);
  revalidate();
  return { ok: true, data: { handler: after! }, message: "Handed back. The agent answers this lead's next message." };
}

/* ─── Workspace settings (Settings › Lead conversations) ──────────────── */

const SUMMARY_MAX = 1000;
const OFFER_MAX = 500;
const BAD_BOOKING_LINK = "Paste a full booking link, e.g. https://cal.com/you/intro";

export interface LeadConversationSettingsView {
  settings: WorkspaceLeadSettings;
  /** Where Needs you emails go (the login email unless one is set). */
  notifyTo: string;
  /** Autopilot runs whose research can fill the business profile. */
  runs: Array<{ id: string; label: string }>;
}

function workspaceCampaigns(workspace: { id: string; isDefault: boolean }) {
  return workspace.isDefault || workspace.id === "primary-default"
    ? or(eq(schema.campaigns.workspaceId, workspace.id), isNull(schema.campaigns.workspaceId))
    : eq(schema.campaigns.workspaceId, workspace.id);
}

/** Live (not deleted) campaigns of the workspace, optionally only those on the workspace default. */
async function workspaceCampaignIds(
  db: any,
  userId: string,
  workspace: { id: string; isDefault: boolean },
  onlyDefault: boolean,
): Promise<string[]> {
  const rows: any[] = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(
      and(
        eq(schema.campaigns.userId, userId),
        onlyDefault ? eq(schema.campaigns.leadConversationMode, "default") : undefined,
        isNull(schema.campaigns.deletedAt),
        workspaceCampaigns(workspace),
      ),
    );
  return rows.map((c) => c.id);
}

/** The campaigns among `ids` whose new lead messages go to the agent (Agent or Agent drafts). */
async function campaignsWithAgent(db: any, userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const views = await loadConversationHandlers(
    db,
    userId,
    ids.map((campaignId) => ({ leadId: null, campaignId })),
  );
  return ids.filter((id) => {
    const view = views.get(conversationKey(null, id));
    return Boolean(view && view.handledBy !== "you");
  });
}

/** Campaigns that use the workspace booking link (their Autopilot run has none of its own). */
async function campaignsUsingWorkspaceBookingLink(db: any, userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const own: any[] = await db
    .select({ campaignId: schema.chadGtmRuns.campaignId })
    .from(schema.chadGtmRuns)
    .where(
      and(
        eq(schema.chadGtmRuns.userId, userId),
        inArray(schema.chadGtmRuns.campaignId, ids),
        isNotNull(schema.chadGtmRuns.bookingUrl),
      ),
    );
  const withOwnLink = new Set(own.filter((r) => r.campaignId).map((r) => String(r.campaignId)));
  return ids.filter((id) => !withOwnLink.has(id));
}

function revalidateConversations() {
  revalidatePath("/settings");
  revalidatePath("/unibox");
  revalidatePath("/requests");
}

export async function getLeadConversationSettingsAction(): Promise<Result<LeadConversationSettingsView>> {
  const user = await requireUser();
  const db = getDb();
  const workspace = await getActiveWorkspace(user.id);
  const settings = await loadWorkspaceLeadSettings(db, user.id, workspace.id === "primary-default" ? null : workspace.id);
  const runs: any[] = await db
    .select({ id: schema.chadGtmRuns.id, companyName: schema.chadGtmRuns.companyName, url: schema.chadGtmRuns.url })
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.userId, user.id), isNull(schema.chadGtmRuns.dismissedAt)))
    .orderBy(desc(schema.chadGtmRuns.createdAt))
    .limit(20);
  return {
    ok: true,
    data: {
      settings,
      notifyTo: settings.notifyEmail.trim() || user.email,
      runs: runs.map((r) => ({ id: r.id, label: String(r.companyName || r.url || "Autopilot run") })),
    },
  };
}

export async function saveLeadConversationSettingsAction(input: {
  defaultMode: LeadConversationMode;
  agentPaused: boolean;
  bookingUrl: string;
  companySummary: string;
  mainOffer: string;
  /** Hand conversations already waiting (last 7 days) to the agent. */
  applyToWaiting?: boolean;
}): Promise<
  Result<{
    settings: WorkspaceLeadSettings;
    requeued: number;
    /** Turning the agent back on: conversations waiting that it could answer (nothing changed yet). */
    waiting: number;
  }>
> {
  const user = await requireUser();
  if (!isLeadConversationMode(input?.defaultMode)) return { ok: false, error: "Choose who answers your leads." };
  const rawBooking = String(input.bookingUrl ?? "").trim();
  const bookingUrl = rawBooking ? normalizeClientBookingUrl(rawBooking) : null;
  if (rawBooking && !bookingUrl) return { ok: false, error: BAD_BOOKING_LINK };
  const companySummary = String(input.companySummary ?? "").trim();
  const mainOffer = String(input.mainOffer ?? "").trim();
  if (companySummary.length > SUMMARY_MAX) return { ok: false, error: `Keep the company summary under ${SUMMARY_MAX} characters.` };
  if (mainOffer.length > OFFER_MAX) return { ok: false, error: `Keep the main offer under ${OFFER_MAX} characters.` };
  if (input.defaultMode === "agent") {
    const grounding = groundingFor({ summary: companySummary, offer: mainOffer, bookingUrl });
    if (!grounding.complete) return { ok: false, error: agentNeedsGroundingError(grounding.missing) };
  }

  const db = getDb();
  const workspace = await getActiveWorkspace(user.id);
  const before = await loadWorkspaceLeadSettings(db, user.id, workspace.id);
  const unpausing = before.agentPaused && input.agentPaused !== true;
  const saved: any[] = await db
    .update(schema.workspaces)
    .set({
      leadConversationMode: input.defaultMode,
      agentPaused: input.agentPaused === true,
      bookingUrl,
      companySummary,
      mainOffer,
      updatedAt: nowIso(),
    })
    .where(and(eq(schema.workspaces.id, workspace.id), eq(schema.workspaces.userId, user.id)))
    .returning({ id: schema.workspaces.id });
  if (saved.length === 0) return { ok: false, error: "Create a workspace first, then save these settings." };

  // A new workspace booking link answers the cards waiting for one, in
  // campaigns without their own (Autopilot run) link.
  let bookingAnswered = 0;
  if (bookingUrl && bookingUrl !== before.bookingUrl) {
    const ids = await campaignsUsingWorkspaceBookingLink(db, user.id, await workspaceCampaignIds(db, user.id, workspace, false));
    if (ids.length > 0) {
      bookingAnswered = (await releaseBookingLinkRequests(db, { userId: user.id, campaignIds: ids, bookingUrl, nowIso: nowIso() }))
        .answered;
    }
  }

  // Turning the pause off affects every campaign of the workspace; a new
  // default affects only campaigns that follow it.
  let requeued = 0;
  let waiting = 0;
  const agentOn = !input.agentPaused && (unpausing || input.defaultMode !== "manual");
  if (agentOn && (input.applyToWaiting || unpausing)) {
    const scope = await campaignsWithAgent(db, user.id, await workspaceCampaignIds(db, user.id, workspace, !unpausing));
    if (input.applyToWaiting) {
      requeued = await requeueWaitingConversations(db, { userId: user.id, campaignIds: scope });
    } else {
      // Nothing changes until the person confirms (handWaitingToAgentAction).
      waiting = (await findWaitingConversations(db, { userId: user.id, campaignIds: scope })).conversations.length;
    }
  }
  revalidateConversations();
  const settings = await loadWorkspaceLeadSettings(db, user.id, workspace.id);
  const parts = [
    requeued > 0
      ? `Saved. ${requeued} waiting ${requeued === 1 ? "conversation goes" : "conversations go"} to the agent.`
      : unpausing
        ? "Saved. The agent answers new replies again."
        : "Lead conversations saved.",
    bookingAnswered > 0
      ? `The agent will answer ${bookingAnswered} ${bookingAnswered === 1 ? "lead" : "leads"} waiting for a booking link.`
      : "",
  ];
  return {
    ok: true,
    data: { settings, requeued, waiting },
    message: parts.filter(Boolean).join(" "),
  };
}

/**
 * After the agent is turned back on (Settings) or outreach resumes (a
 * campaign): hand the conversations waiting from the last 7 days to the
 * agent. Only on the person's confirmation; nothing is sent here, and the
 * agent re-checks every conversation before it answers.
 */
export async function handWaitingToAgentAction(
  target: { campaignId: string } | { workspace: true },
): Promise<Result<{ requeued: number }>> {
  const user = await requireUser();
  const db = getDb();
  let campaignIds: string[];
  if ("campaignId" in target) {
    const state = await loadCampaignConversationState(db, user.id, String(target.campaignId ?? ""));
    if (!state) return { ok: false, error: "Campaign not found." };
    if (state.effective.handledBy === "you") {
      return { ok: false, error: "The agent is off for this campaign, so there's nothing to hand over." };
    }
    if (state.campaignStatus === "paused") return { ok: false, error: "Resume the campaign first." };
    campaignIds = [String(target.campaignId)];
  } else {
    const workspace = await getActiveWorkspace(user.id);
    const settings = await loadWorkspaceLeadSettings(db, user.id, workspace.id);
    if (settings.agentPaused) return { ok: false, error: "The agent is paused for this workspace. Turn it back on first." };
    campaignIds = await campaignsWithAgent(db, user.id, await workspaceCampaignIds(db, user.id, workspace, false));
  }
  const requeued = await requeueWaitingConversations(db, { userId: user.id, campaignIds });
  revalidateConversations();
  revalidatePath("/chad-gtm");
  return {
    ok: true,
    data: { requeued },
    message:
      requeued > 0
        ? `${requeued} waiting ${requeued === 1 ? "conversation goes" : "conversations go"} to the agent.`
        : "Nothing is waiting anymore.",
  };
}

/** Business profile from an Autopilot run's research, to prefill the form (nothing is saved). */
export async function copyProfileFromRunAction(
  runId: string,
): Promise<Result<{ summary: string; offer: string; bookingUrl: string | null }>> {
  const user = await requireUser();
  const [run]: any[] = await getDb()
    .select({
      businessOverview: schema.chadGtmRuns.businessOverview,
      offers: schema.chadGtmRuns.offers,
      bookingUrl: schema.chadGtmRuns.bookingUrl,
    })
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.id, String(runId ?? "")), eq(schema.chadGtmRuns.userId, user.id)))
    .limit(1);
  if (!run) return { ok: false, error: "Run not found." };
  const overview = (run.businessOverview ?? {}) as { summary?: string };
  return {
    ok: true,
    data: {
      summary: String(overview.summary ?? "").trim().slice(0, SUMMARY_MAX),
      offer: runOfferLine(run.offers).slice(0, OFFER_MAX),
      bookingUrl: run.bookingUrl || null,
    },
  };
}

/* ─── One campaign or Autopilot run ───────────────────────────────────── */

export async function getLeadConversationStateAction(
  target: LeadConversationTarget,
): Promise<Result<LeadConversationState>> {
  const user = await requireUser();
  const db = getDb();
  const state =
    "campaignId" in target && target.campaignId
      ? await loadCampaignConversationState(db, user.id, String(target.campaignId))
      : "runId" in target && target.runId
        ? await loadRunConversationState(db, user.id, String(target.runId))
        : null;
  if (!state) return { ok: false, error: "Not found." };
  return { ok: true, data: state };
}

/** How many conversations a mode change would affect (nothing is changed). */
export async function previewModeChangeAction(
  target: { campaignId: string } | { workspace: true },
): Promise<Result<{ waiting: number; openDrafts: number }>> {
  const user = await requireUser();
  const db = getDb();
  let campaignIds: string[] = [];
  if ("campaignId" in target) {
    const state = await loadCampaignConversationState(db, user.id, String(target.campaignId ?? ""));
    if (!state) return { ok: false, error: "Campaign not found." };
    campaignIds = [String(target.campaignId)];
  } else {
    const workspace = await getActiveWorkspace(user.id);
    campaignIds = await workspaceCampaignIds(db, user.id, workspace, true);
  }
  const { conversations, openDrafts } = await findWaitingConversations(db, { userId: user.id, campaignIds });
  return { ok: true, data: { waiting: conversations.length, openDrafts } };
}

function revalidateTarget(state: LeadConversationState) {
  if (state.target.kind === "campaign") {
    revalidatePath(`/campaigns/${state.target.campaignId}`);
    if (state.target.runId) revalidatePath(`/chad-gtm/${state.target.runId}`);
  } else {
    revalidatePath(`/chad-gtm/${state.target.runId}`);
  }
  revalidatePath("/chad-gtm");
  revalidatePath("/unibox");
  revalidatePath("/requests");
}

/**
 * Change a campaign's "Lead conversations" setting ('default' = the
 * workspace default). Refuses Agent until the agent has a business profile,
 * offer and booking link. A linked Autopilot run shows the same value.
 */
export async function setCampaignConversationModeAction(input: {
  campaignId: string;
  value: CampaignConversationSetting;
  /** Hand conversations already waiting (last 7 days) to the agent. */
  applyToWaiting?: boolean;
}): Promise<Result<{ state: LeadConversationState; requeued: number }>> {
  const user = await requireUser();
  if (!isCampaignSetting(input?.value)) return { ok: false, error: "Choose who answers this campaign's leads." };
  const campaignId = String(input.campaignId ?? "");
  const db = getDb();
  const before = await loadCampaignConversationState(db, user.id, campaignId);
  if (!before) return { ok: false, error: "Campaign not found." };
  if (input.value === "agent" && !before.grounding.complete) {
    return { ok: false, error: agentNeedsGroundingError(before.grounding.missing) };
  }

  const updated: any[] = await db
    .update(schema.campaigns)
    .set({ leadConversationMode: input.value, updatedAt: nowIso() })
    .where(and(eq(schema.campaigns.id, campaignId), eq(schema.campaigns.userId, user.id)))
    .returning({ id: schema.campaigns.id });
  if (updated.length === 0) return { ok: false, error: "Campaign not found." };
  const after = (await loadCampaignConversationState(db, user.id, campaignId)) ?? before;

  // The run page shows the same value: mirror the mode (without the workspace pause).
  if (after.target.kind === "campaign" && after.target.runId) {
    const base: LeadConversationMode = input.value === "default" ? after.workspaceDefault : input.value;
    const mirrored: LeadConversationMode = base === "agent" && !after.grounding.complete ? "approve" : base;
    await db
      .update(schema.chadGtmRuns)
      .set({ replyAgentMode: runModeFor(mirrored), updatedAt: nowIso() })
      .where(and(eq(schema.chadGtmRuns.id, after.target.runId), eq(schema.chadGtmRuns.userId, user.id)));
  }

  const requeued =
    input.applyToWaiting && after.effective.handledBy !== "you"
      ? await requeueWaitingConversations(db, { userId: user.id, campaignIds: [campaignId] })
      : 0;
  revalidateTarget(after);
  const label = effectiveLabel(after.effective, after.setting);
  return {
    ok: true,
    data: { state: after, requeued },
    message:
      requeued > 0
        ? `Lead conversations: ${label}. ${requeued} waiting ${requeued === 1 ? "conversation goes" : "conversations go"} to the agent.`
        : `Lead conversations: ${label}.`,
  };
}

/** "What this campaign offers": extra detail the agent may use for this campaign. */
export async function setCampaignAgentOfferAction(input: {
  campaignId: string;
  offer: string;
}): Promise<Result<{ state: LeadConversationState }>> {
  const user = await requireUser();
  const offer = String(input?.offer ?? "").trim();
  if (offer.length > OFFER_MAX) return { ok: false, error: `Keep it under ${OFFER_MAX} characters.` };
  const db = getDb();
  const updated: any[] = await db
    .update(schema.campaigns)
    .set({ agentOffer: offer, updatedAt: nowIso() })
    .where(
      and(
        eq(schema.campaigns.id, String(input?.campaignId ?? "")),
        eq(schema.campaigns.userId, user.id),
        isNull(schema.campaigns.deletedAt),
      ),
    )
    .returning({ id: schema.campaigns.id });
  if (updated.length === 0) return { ok: false, error: "Campaign not found." };
  const state = await loadCampaignConversationState(db, user.id, String(input.campaignId));
  if (!state) return { ok: false, error: "Campaign not found." };
  revalidateTarget(state);
  return { ok: true, data: { state }, message: offer ? "Saved. The agent uses this for this campaign." : "Cleared." };
}

/**
 * The mode of an Autopilot run. Before launch it is stored on the run (and
 * becomes the campaign's setting at launch); after launch it is the
 * campaign's setting.
 */
export async function setRunConversationModeAction(input: {
  runId: string;
  mode: LeadConversationMode;
  applyToWaiting?: boolean;
}): Promise<Result<{ state: LeadConversationState; requeued: number }>> {
  const user = await requireUser();
  if (!isLeadConversationMode(input?.mode)) return { ok: false, error: "Choose who answers your leads." };
  const db = getDb();
  const [run]: any[] = await db
    .select({ id: schema.chadGtmRuns.id, campaignId: schema.chadGtmRuns.campaignId })
    .from(schema.chadGtmRuns)
    .where(and(eq(schema.chadGtmRuns.id, String(input.runId ?? "")), eq(schema.chadGtmRuns.userId, user.id)))
    .limit(1);
  if (!run) return { ok: false, error: "Run not found." };
  if (run.campaignId) {
    return setCampaignConversationModeAction({
      campaignId: run.campaignId,
      value: input.mode,
      applyToWaiting: input.applyToWaiting,
    });
  }
  const updated: any[] = await db
    .update(schema.chadGtmRuns)
    .set({ replyAgentMode: runModeFor(input.mode), updatedAt: nowIso() })
    .where(
      and(
        eq(schema.chadGtmRuns.id, run.id),
        eq(schema.chadGtmRuns.userId, user.id),
        isNull(schema.chadGtmRuns.campaignId),
      ),
    )
    .returning({ id: schema.chadGtmRuns.id });
  if (updated.length === 0) return { ok: false, error: "This run just launched. Refresh and try again." };
  const state = await loadRunConversationState(db, user.id, run.id);
  if (!state) return { ok: false, error: "Run not found." };
  revalidateTarget(state);
  return {
    ok: true,
    data: { state, requeued: 0 },
    message: `Lead conversations: ${effectiveLabel(state.effective, state.setting)}.`,
  };
}

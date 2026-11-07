/**
 * "Lead conversations" wording, shared by every screen that shows who talks
 * to leads. Client-safe: no server imports (types only from the engine).
 */
import type {
  CampaignConversationSetting,
  ConversationModeReason,
  EffectiveConversation,
  GroundingGap,
  HandledBy,
  LeadConversationMode,
} from "@smartreach/email-engine/lead-conversations";

export type { CampaignConversationSetting, ConversationModeReason, GroundingGap, HandledBy, LeadConversationMode };

export const LEAD_CONVERSATIONS_LABEL = "Lead conversations";

export const MODE_LABEL: Record<LeadConversationMode, string> = {
  agent: "Agent",
  approve: "Agent drafts, you approve",
  manual: "Manual",
};

export const USE_WORKSPACE_DEFAULT_LABEL = "Use workspace default";

export const SETTING_LABEL: Record<CampaignConversationSetting, string> = {
  default: USE_WORKSPACE_DEFAULT_LABEL,
  ...MODE_LABEL,
};

/** One line under each mode, the same everywhere it appears. */
export const MODE_DESCRIPTION: Record<LeadConversationMode, string> = {
  agent: "The agent answers on its own and hands anything it can't handle to you.",
  approve: "The agent writes every reply and nothing is sent until you approve it.",
  manual: "You answer everything and the agent stays silent.",
};

/** Text of the "Handled by" chip in a conversation header. */
export const HANDLER_CHIP_LABEL: Record<HandledBy, string> = {
  agent: "Agent",
  approve: "Agent drafts",
  you: "You",
};

export function handledByLabel(handledBy: HandledBy): string {
  return `Handled by: ${HANDLER_CHIP_LABEL[handledBy]}`;
}

export const TAKE_OVER_LABEL = "Take over";
export const HAND_BACK_LABEL = "Hand back to agent";
export const TAKEN_OVER_TOAST = "You've taken over; the agent won't reply here.";
export const HANDED_BACK_TOAST = "Handed back. The agent answers this lead's next message.";
export const RESUMED_AFTER_ANSWER_TOAST = "Sent. The agent picks this conversation back up.";
export const MANUAL_HAND_BACK_ERROR = "This campaign is set to Manual. Change it on the campaign page first.";
export const PAUSED_HAND_BACK_ERROR = "The agent is paused for this workspace. Turn it back on in Settings first.";
/** Shown wherever the workspace-wide pause is on. */
export const AGENT_PAUSED_WORKSPACE_NOTE = "Agent paused for this workspace";
/** Shown on a campaign (or run) whose outreach is paused. */
export const CAMPAIGN_PAUSED_NOTE = "Paused: the agent won't reply while this campaign is paused.";
export const PAUSE_AGENT_EVERYWHERE_LABEL = "Pause the agent everywhere";
export const PAUSE_AGENT_EVERYWHERE_HINT =
  "The agent stops replying in every campaign in this workspace. Replies wait for you in the Inbox.";
/** Pause outreach on an Autopilot run. */
export const PAUSE_OUTREACH_HINT = "Stops new emails and the agent's replies until you resume.";
export const OUTREACH_PAUSED_TOAST = "Outreach paused. New emails and the agent's replies stop until you resume.";

/** A Needs you card someone (or another tab) already answered, dismissed or is sending. */
export const REQUEST_ALREADY_HANDLED = "This was already handled. Refresh to see the latest.";

/** Why the chip says what it says, for a tooltip or hint. */
export function handlerHint(handledBy: HandledBy, reason: ConversationModeReason): string {
  if (handledBy !== "you") {
    return handledBy === "agent" ? MODE_DESCRIPTION.agent : MODE_DESCRIPTION.approve;
  }
  switch (reason) {
    case "conversation":
      return "You took this conversation over, so the agent won't reply here.";
    case "paused":
      return AGENT_PAUSED_WORKSPACE_NOTE;
    case "no_campaign":
      return "This reply isn't part of a campaign.";
    default:
      return "This campaign is set to Manual.";
  }
}

/**
 * The mode in effect, with where it comes from, e.g.
 * "Agent (from workspace default)" or "Agent drafts, you approve (missing booking link)".
 */
export function effectiveLabel(
  effective: Pick<EffectiveConversation, "mode" | "downgraded" | "missing">,
  setting: CampaignConversationSetting,
): string {
  const label = MODE_LABEL[effective.mode];
  const notes: string[] = [];
  if (setting === "default") notes.push("from workspace default");
  if (effective.downgraded && effective.missing.length > 0) notes.push(`missing ${joinWords(effective.missing)}`);
  return notes.length > 0 ? `${label} (${notes.join("; ")})` : label;
}


/* ─── Settings and per-campaign control ───────────────────────────────── */

/** Pre-launch Autopilot runs store the mode as chad_gtm_runs.reply_agent_mode. */
export type RunReplyMode = "autopilot" | "approve" | "off";

export function modeFromRun(runMode: string | null | undefined): LeadConversationMode {
  return runMode === "approve" ? "approve" : runMode === "off" ? "manual" : "agent";
}

export function runModeFor(mode: LeadConversationMode): RunReplyMode {
  return mode === "agent" ? "autopilot" : mode === "approve" ? "approve" : "off";
}

export function isLeadConversationMode(value: unknown): value is LeadConversationMode {
  return value === "agent" || value === "approve" || value === "manual";
}

export function isCampaignSetting(value: unknown): value is CampaignConversationSetting {
  return value === "default" || isLeadConversationMode(value);
}

/** Where the control lives: a campaign (launched runs included) or a run not launched yet. */
export type LeadConversationTarget = { campaignId: string } | { runId: string };

/** Everything the "Lead conversations" control shows for one campaign or run. */
export interface LeadConversationState {
  target: { kind: "campaign"; campaignId: string; runId: string | null } | { kind: "run"; runId: string };
  /** What is stored ('default' only on campaigns). */
  setting: CampaignConversationSetting;
  /** The mode in effect for new lead messages. */
  effective: Pick<EffectiveConversation, "mode" | "handledBy" | "reason" | "downgraded" | "missing">;
  workspaceDefault: LeadConversationMode;
  agentPaused: boolean;
  grounding: { complete: boolean; missing: GroundingGap[] };
  /** "What this campaign offers" (campaigns only). */
  agentOffer: string;
  campaignStatus: string | null;
}

export const SETTINGS_HREF = "/settings#lead-conversations";

export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "a booking link", "a business profile and a main offer". */
export function missingPhrase(missing: readonly GroundingGap[]): string {
  return joinWords(missing.map((m) => `a ${m}`));
}

/** Shown when the setting is Agent but grounding is incomplete. */
export function downgradedNote(missing: readonly GroundingGap[]): string {
  return `Set to Agent, but the agent needs ${missingPhrase(missing)}, so it drafts replies for your approval.`;
}

/** Why Agent can't be chosen yet. */
export function agentUnavailableNote(missing: readonly GroundingGap[]): string {
  return `To let the agent answer on its own, add ${missingPhrase(missing)} in Settings › Lead conversations. Until then it can draft replies for your approval.`;
}

export function agentNeedsGroundingError(missing: readonly GroundingGap[]): string {
  return `The agent needs ${missingPhrase(missing)} before it can answer on its own. Choose "${MODE_LABEL.approve}", or add ${missing.length === 1 ? "it" : "them"} in Settings › Lead conversations.`;
}

export function waitingConfirmTitle(waiting: number): string {
  return `${waiting} ${waiting === 1 ? "conversation" : "conversations"} from the last 7 days ${waiting === 1 ? "is" : "are"} waiting for a reply. Hand them to the agent?`;
}

export function openDraftsNote(openDrafts: number): string {
  return `${openDrafts} ${openDrafts === 1 ? "draft stays" : "drafts stay"} in Needs you, marked 'Agent off: answer manually'. Nothing is sent.`;
}

export const HAND_TO_AGENT_LABEL = "Hand them to the agent";
export const ONLY_NEW_REPLIES_LABEL = "Only new replies";
export const AGENT_OFF_BADGE = "Agent off: answer manually";

/* ─── Who answered (Mission control, activity) ────────────────────────── */

/**
 * Count the answers sent in a campaign by who wrote them. Rows are
 * unibox_messages grouped by from_role and approved_by_user.
 */
export function countReplyAuthors(
  rows: ReadonlyArray<{ fromRole: string | null; approvedByUser: boolean | null; n: number | string }>,
): { agent: number; approved: number; you: number } {
  const out = { agent: 0, approved: 0, you: 0 };
  for (const r of rows) {
    const n = Number(r.n) || 0;
    if (r.fromRole === "agent") {
      if (r.approvedByUser) out.approved += n;
      else out.agent += n;
    } else if (r.fromRole === "operator") {
      out.you += n;
    }
  }
  return out;
}

/** "3 by the agent · 1 approved by you · 2 by you", leaving out zeros. */
export function replyAuthorsHint(counts: { agent: number; approved: number; you: number }): string {
  const parts = [
    counts.agent > 0 ? `${counts.agent.toLocaleString()} by the agent` : null,
    counts.approved > 0 ? `${counts.approved.toLocaleString()} approved by you` : null,
    counts.you > 0 ? `${counts.you.toLocaleString()} by you` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "None answered yet";
}

export type RunActivityAgentType = "agent" | "you" | "waiting" | "agent_skipped";

/** Activity row for a reply's agent status, or null when nothing happened yet. */
export function activityTypeForAgentStatus(status: string | null | undefined): RunActivityAgentType | null {
  switch (status) {
    case "replied":
      return "agent";
    case "human_replied":
      return "you";
    case "escalated":
    case "held":
      return "waiting";
    case "skipped":
    case "failed":
      return "agent_skipped";
    default:
      return null;
  }
}

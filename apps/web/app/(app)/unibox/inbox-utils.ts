import type { BadgeProps } from "@smartreach/ui";
import type { UniboxReplyTag } from "@smartreach/shared";
import { resolveBubbleSide } from "@/lib/message-body";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";
import type { ConversationModeReason, HandledBy } from "@/lib/lead-conversations";

/** One inbound reply as loaded by the inbox page. */
export interface ReplyRow {
  id: string;
  leadId: string | null;
  campaignId: string | null;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string;
  readAt: string | null;
  tag: string | null;
  /** Who set `tag`: 'human' (you) or 'auto'. NULL with a tag = automatic. */
  tagSource?: string | null;
  agentStatus?: string | null;
  agentIntent?: string | null;
  agentSummary?: string | null;
  campaignName: string | null;
  senderEmail: string | null;
  senderName: string | null;
  /** Who handles this lead's conversation ("Lead conversations"). */
  handledBy?: HandledBy;
  handlerReason?: ConversationModeReason;
  /** Taken over by you, and the campaign would hand it to the agent again. */
  canHandBack?: boolean;
}

/** An open Needs you card, as loaded by the inbox page. */
export interface OpenRequestRow {
  id: string;
  replyId: string | null;
  leadId: string | null;
  campaignId: string | null;
  kind: string;
  title: string;
  question: string;
  draftReply: string;
  draftSource: "agent" | "you";
  hasPendingKnowledge: boolean;
  createdAt: string;
}

/**
 * The open request for a conversation: one whose reply is in the
 * conversation, else one for the same lead and campaign.
 */
export function requestForConversation(
  conversation: { memberIds: string[]; latest: Pick<ReplyRow, "leadId" | "campaignId"> },
  requests: readonly OpenRequestRow[],
): OpenRequestRow | null {
  const members = new Set(conversation.memberIds);
  const byReply = requests.find((r) => r.replyId != null && members.has(r.replyId));
  if (byReply) return byReply;
  const { leadId, campaignId } = conversation.latest;
  if (!leadId || !campaignId) return null;
  return requests.find((r) => r.leadId === leadId && r.campaignId === campaignId) ?? null;
}

/** Newest time on screen in a conversation (the lead's replies and the transcript). */
export function latestSeenAt(rows: ReadonlyArray<Pick<ReplyRow, "receivedAt">>, messages: ReadonlyArray<Pick<UniboxThreadMessage, "sentAt">>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const t of [...rows.map((r) => r.receivedAt), ...messages.map((m) => m.sentAt)]) {
    const ms = Date.parse(t);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = t;
    }
  }
  return best;
}

export type InboxView = "all" | "unread" | "awaiting" | "needs_you";

export const TAG_LABEL: Record<UniboxReplyTag, string> = {
  out_of_office: "Out of office",
  not_interested: "Not interested",
  interested: "Interested",
  meeting_booked: "Meeting booked",
  won: "Won",
  lost: "Lost",
};

export function tagLabel(tag: string): string {
  return TAG_LABEL[tag as UniboxReplyTag] ?? tag.replace(/_/g, " ");
}

/** What choosing a tag does, shown under it in the tag menu. */
export function tagEffect(tag: string): string {
  switch (tag) {
    case "out_of_office":
      return "Label only. Follow-ups keep going.";
    case "not_interested":
      return "Marks the lead Lost. You can also stop all emails to them.";
    case "interested":
      return "Marks the lead Interested.";
    case "meeting_booked":
      return "Marks the lead Meeting booked.";
    case "won":
      return "Marks the lead Won.";
    case "lost":
      return "Marks the lead Lost.";
    default:
      return "";
  }
}

export function tagVariant(tag: string): BadgeProps["variant"] {
  switch (tag) {
    case "interested":
    case "won":
      return "success";
    case "meeting_booked":
      return "info";
    case "out_of_office":
      return "warning";
    case "lost":
      return "destructive";
    default:
      return "neutral";
  }
}

export function displayName(row: Pick<ReplyRow, "fromName" | "fromEmail">): string {
  return row.fromName?.trim() || row.fromEmail.split("@")[0] || row.fromEmail;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const second = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + second).toUpperCase() || "?";
}

export function sortAscending(messages: UniboxThreadMessage[]): UniboxThreadMessage[] {
  return [...messages].sort((a, b) => {
    const ta = Date.parse(a.sentAt) || 0;
    const tb = Date.parse(b.sentAt) || 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/** Fetched transcript wins on id; keep optimistic rows the server has not returned yet. */
export function mergeThread(fetched: UniboxThreadMessage[], optimistic: UniboxThreadMessage[]): UniboxThreadMessage[] {
  const map = new Map<string, UniboxThreadMessage>();
  for (const m of optimistic) map.set(m.id, m);
  for (const m of fetched) map.set(m.id, m);
  return sortAscending([...map.values()]);
}

/** The lead's reply on its own, shown when the full transcript cannot be loaded. */
export function replyAsMessage(r: ReplyRow): UniboxThreadMessage {
  return {
    id: `inbound:${r.id}`,
    direction: "inbound",
    fromRole: "lead",
    fromName: r.fromName || "",
    fromEmail: r.fromEmail,
    subject: r.subject || null,
    bodyHtml: r.bodyHtml || "",
    bodyText: r.bodyText || r.snippet || "",
    sentAt: r.receivedAt,
    tag: (r.tag as UniboxReplyTag | null) ?? null,
  };
}

export const APPROVED_AGENT_LABEL = "Agent, approved by you";

/** List badge for who answered (or is answering) the newest message, or null. */
export function replyStatusBadge(agentStatus: string | null | undefined): { label: string; variant: BadgeProps["variant"] } | null {
  switch (agentStatus) {
    case "human_replied":
      return { label: "You replied", variant: "neutral" };
    case "replied":
      return { label: "Agent replied", variant: "neutral" };
    case "pending":
    case "processing":
      return { label: "Agent replying", variant: "info" };
    default:
      return null;
  }
}

/**
 * Who wrote a message, from the inbox owner's point of view. `label` is the
 * badge text: "You", "Agent", "Agent, approved by you" or "Campaign".
 */
export function messageAuthor(m: UniboxThreadMessage): {
  name: string;
  role: "lead" | "you" | "agent" | "campaign";
  label: string | null;
} {
  const author = baseAuthor(m);
  const label =
    author.role === "agent"
      ? m.approvedByUser
        ? APPROVED_AGENT_LABEL
        : "Agent"
      : author.role === "you"
        ? "You"
        : author.role === "campaign"
          ? "Campaign"
          : null;
  return { ...author, label };
}

function baseAuthor(m: UniboxThreadMessage): { name: string; role: "lead" | "you" | "agent" | "campaign" } {
  if (m.fromRole === "agent") return { name: m.fromName || m.fromEmail || "Agent", role: "agent" };
  if (resolveBubbleSide(m) === "right") return { name: m.fromName || "You", role: "you" };
  if (m.direction === "campaign" || m.fromRole === "automation") {
    return { name: m.fromName || m.fromEmail || "Campaign", role: "campaign" };
  }
  return { name: m.fromName || m.fromEmail || "Lead", role: "lead" };
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable ||
    Boolean(el.closest?.("[role=listbox],[role=menu],[role=dialog]"))
  );
}

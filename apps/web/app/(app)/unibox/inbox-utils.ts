import type { BadgeProps } from "@smartreach/ui";
import type { UniboxReplyTag } from "@smartreach/shared";
import { resolveBubbleSide } from "@/lib/message-body";
import type { UniboxThreadMessage } from "@/lib/unibox-thread";

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
  agentStatus?: string | null;
  agentSummary?: string | null;
  campaignName: string | null;
  senderEmail: string | null;
  senderName: string | null;
}

export type InboxView = "all" | "unread" | "needs_you";

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

/** Who wrote a message, from the inbox owner's point of view. */
export function messageAuthor(m: UniboxThreadMessage): { name: string; role: "lead" | "you" | "agent" | "campaign" } {
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

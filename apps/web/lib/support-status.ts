import { TICKET_STATUSES, type TicketStatus } from "./support-types";

/**
 * Support ticket status rules. Pure and client-safe: the server enforces them in
 * lib/support.ts and the ticket page uses them to show only the allowed action.
 */

export function isTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === "string" && TICKET_STATUSES.some((s) => s.id === v);
}

/**
 * Status after a new message. A support reply on an open ticket marks it in progress.
 * A customer reply on a resolved or closed ticket reopens it so support sees it.
 */
export function statusAfterReply(current: TicketStatus, senderIsAdmin: boolean): TicketStatus {
  if (senderIsAdmin) return current === "open" ? "in_progress" : current;
  return current === "resolved" || current === "closed" ? "open" : current;
}

/** The one status change a customer can make on their own ticket. */
export function customerStatusAction(current: TicketStatus): { to: TicketStatus; label: string } {
  return current === "resolved" || current === "closed"
    ? { to: "open", label: "Reopen" }
    : { to: "resolved", label: "Mark resolved" };
}

/** Why this status change is refused, or null when it is allowed. */
export function ticketStatusChangeError({
  isAdmin,
  isOwner,
  from,
  to,
}: {
  isAdmin: boolean;
  isOwner: boolean;
  from: string;
  to: unknown;
}): string | null {
  if (!isTicketStatus(to)) return "Unknown status.";
  if (isAdmin) return null;
  if (!isOwner) return "Unauthorized.";
  const allowed = isTicketStatus(from) ? customerStatusAction(from).to : null;
  if (to !== allowed) return "You can mark your ticket resolved or reopen it. Support sets the other statuses.";
  return null;
}

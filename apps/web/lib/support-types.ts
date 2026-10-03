export type TicketCategory =
  | "bug_report"
  | "feature_request"
  | "suggestion"
  | "contact"
  | "miscellaneous";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicketDTO {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  workspaceId: string | null;
  category: TicketCategory;
  heading: string;
  description: string;
  url: string | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messageCount?: number;
}

export interface SupportTicketMessageDTO {
  id: string;
  ticketId: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  senderRole: "user" | "admin";
  message: string;
  createdAt: string;
}

export const TICKET_CATEGORIES: { id: TicketCategory; label: string; badge: string; description: string }[] = [
  {
    id: "bug_report",
    label: "Bug Report",
    badge: "Bug",
    description: "Something is broken, displaying incorrectly, or throwing an unexpected error.",
  },
  {
    id: "feature_request",
    label: "Feature Request",
    badge: "Feature",
    description: "Idea or capability you'd like added to the ChadGTM autonomous pipeline.",
  },
  {
    id: "suggestion",
    label: "Suggestion",
    badge: "Idea",
    description: "Improvements to copy quality, delivery velocity, UX, or swipe deck flow.",
  },
  {
    id: "contact",
    label: "Direct Contact",
    badge: "Contact",
    description: "Reach the core engineering team directly for enterprise custom setups.",
  },
  {
    id: "miscellaneous",
    label: "Miscellaneous",
    badge: "Misc",
    description: "General questions, feedback, or miscellaneous inquiries.",
  },
];

export const TICKET_STATUSES: { id: TicketStatus; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "Ongoing" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

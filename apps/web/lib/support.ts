import { and, count, desc, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { isAdmin, requireAdmin } from "./admin";

export * from "./support-types";
import type { TicketCategory, TicketStatus, SupportTicketDTO, SupportTicketMessageDTO } from "./support-types";


/**
 * Normal user submits a new support ticket.
 */
export async function createSupportTicket(
  userId: string,
  userEmail: string,
  userName: string | null,
  workspaceId: string | null,
  data: {
    category: TicketCategory;
    heading: string;
    description: string;
    url?: string | null;
  }
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const heading = data.heading?.trim();
  const description = data.description?.trim();

  if (!heading || heading.length < 3) {
    return { ok: false, error: "Please enter a descriptive ticket subject (at least 3 characters)." };
  }
  if (!description || description.length < 5) {
    return { ok: false, error: "Please provide a detailed description of your request or issue." };
  }

  const db = getDb();
  const ticketId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db.insert(schema.supportTickets).values({
    id: ticketId,
    userId,
    userEmail,
    userName: userName || null,
    workspaceId: workspaceId || null,
    category: data.category || "bug_report",
    heading,
    description,
    url: data.url?.trim() || null,
    status: "open",
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  // Seed the first message in the ticket thread
  await db.insert(schema.supportTicketMessages).values({
    id: messageId,
    ticketId,
    userId,
    userName: userName || null,
    userEmail,
    senderRole: "user",
    message: description,
    createdAt: nowIso,
  });

  return { ok: true, id: ticketId };
}

/**
 * Returns tickets submitted by a specific user.
 */
export async function listUserTickets(userId: string): Promise<SupportTicketDTO[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.supportTickets.id,
      userId: schema.supportTickets.userId,
      userEmail: schema.supportTickets.userEmail,
      userName: schema.supportTickets.userName,
      workspaceId: schema.supportTickets.workspaceId,
      category: schema.supportTickets.category,
      heading: schema.supportTickets.heading,
      description: schema.supportTickets.description,
      url: schema.supportTickets.url,
      status: schema.supportTickets.status,
      createdAt: schema.supportTickets.createdAt,
      updatedAt: schema.supportTickets.updatedAt,
      messageCount: count(schema.supportTicketMessages.id),
    })
    .from(schema.supportTickets)
    .leftJoin(
      schema.supportTicketMessages,
      eq(schema.supportTicketMessages.ticketId, schema.supportTickets.id)
    )
    .where(eq(schema.supportTickets.userId, userId))
    .groupBy(schema.supportTickets.id)
    .orderBy(desc(schema.supportTickets.updatedAt))
    .limit(200);

  return rows.map((r) => ({
    ...r,
    category: r.category as TicketCategory,
    status: r.status as TicketStatus,
    messageCount: Number(r.messageCount ?? 1),
  }));
}

/**
 * Admin view: lists all support tickets received across all users.
 */
export async function listAllTicketsForAdmin(currentUser: { email?: string | null }): Promise<SupportTicketDTO[]> {
  requireAdmin(currentUser);
  const db = getDb();
  const rows = await db
    .select({
      id: schema.supportTickets.id,
      userId: schema.supportTickets.userId,
      userEmail: schema.supportTickets.userEmail,
      userName: schema.supportTickets.userName,
      workspaceId: schema.supportTickets.workspaceId,
      category: schema.supportTickets.category,
      heading: schema.supportTickets.heading,
      description: schema.supportTickets.description,
      url: schema.supportTickets.url,
      status: schema.supportTickets.status,
      createdAt: schema.supportTickets.createdAt,
      updatedAt: schema.supportTickets.updatedAt,
      messageCount: count(schema.supportTicketMessages.id),
    })
    .from(schema.supportTickets)
    .leftJoin(
      schema.supportTicketMessages,
      eq(schema.supportTicketMessages.ticketId, schema.supportTickets.id)
    )
    .groupBy(schema.supportTickets.id)
    .orderBy(desc(schema.supportTickets.updatedAt))
    .limit(500);

  return rows.map((r) => ({
    ...r,
    category: r.category as TicketCategory,
    status: r.status as TicketStatus,
    messageCount: Number(r.messageCount ?? 1),
  }));
}

/**
 * Fetch a ticket and its complete conversation thread.
 */
export async function getTicketDetails(
  ticketId: string,
  currentUser: { id: string; email?: string | null }
): Promise<{
  ticket: SupportTicketDTO;
  messages: SupportTicketMessageDTO[];
  isAdminUser: boolean;
} | null> {
  const db = getDb();
  const [ticketRow] = await db
    .select()
    .from(schema.supportTickets)
    .where(eq(schema.supportTickets.id, ticketId))
    .limit(1);

  if (!ticketRow) return null;

  const isAdminUser = isAdmin(currentUser);
  if (ticketRow.userId !== currentUser.id && !isAdminUser) {
    return null; // Forbidden
  }

  const messages = await db
    .select()
    .from(schema.supportTicketMessages)
    .where(eq(schema.supportTicketMessages.ticketId, ticketId))
    .orderBy(schema.supportTicketMessages.createdAt);

  return {
    ticket: {
      ...ticketRow,
      category: ticketRow.category as TicketCategory,
      status: ticketRow.status as TicketStatus,
      messageCount: messages.length,
    },
    messages: messages as SupportTicketMessageDTO[],
    isAdminUser,
  };
}

/**
 * Add a reply message to a support ticket thread.
 */
export async function addMessageToTicket(
  ticketId: string,
  currentUser: { id: string; email?: string | null; name?: string | null },
  messageText: string
): Promise<{ ok: boolean; error?: string }> {
  const text = messageText?.trim();
  if (!text) {
    return { ok: false, error: "Reply message cannot be empty." };
  }

  const db = getDb();
  const [ticket] = await db
    .select()
    .from(schema.supportTickets)
    .where(eq(schema.supportTickets.id, ticketId))
    .limit(1);

  if (!ticket) return { ok: false, error: "Ticket not found." };

  const userIsAdmin = isAdmin(currentUser);
  if (ticket.userId !== currentUser.id && !userIsAdmin) {
    return { ok: false, error: "You do not have permission to reply to this ticket." };
  }

  const messageId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const role: "admin" | "user" = userIsAdmin ? "admin" : "user";

  await db.insert(schema.supportTicketMessages).values({
    id: messageId,
    ticketId,
    userId: currentUser.id,
    userName: currentUser.name || null,
    userEmail: currentUser.email || "support@chadgtm.com",
    senderRole: role,
    message: text,
    createdAt: nowIso,
  });

  // Automatically update ticket's updatedAt and status if applicable
  const newStatus: TicketStatus =
    userIsAdmin && ticket.status === "open"
      ? "in_progress"
      : ticket.status === "resolved" && !userIsAdmin
      ? "open" // Customer re-opened with new reply
      : (ticket.status as TicketStatus);

  await db
    .update(schema.supportTickets)
    .set({
      updatedAt: nowIso,
      status: newStatus,
    })
    .where(eq(schema.supportTickets.id, ticketId));

  return { ok: true };
}

/**
 * Update the lifecycle status of a support ticket.
 */
export async function updateTicketStatus(
  currentUser: { email?: string | null; id: string },
  ticketId: string,
  newStatus: TicketStatus
): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const [ticket] = await db
    .select()
    .from(schema.supportTickets)
    .where(eq(schema.supportTickets.id, ticketId))
    .limit(1);

  if (!ticket) return { ok: false, error: "Ticket not found." };

  const userIsAdmin = isAdmin(currentUser);
  if (!userIsAdmin && ticket.userId !== currentUser.id) {
    return { ok: false, error: "Unauthorized." };
  }

  const nowIso = new Date().toISOString();
  await db
    .update(schema.supportTickets)
    .set({
      status: newStatus,
      updatedAt: nowIso,
    })
    .where(eq(schema.supportTickets.id, ticketId));

  return { ok: true };
}

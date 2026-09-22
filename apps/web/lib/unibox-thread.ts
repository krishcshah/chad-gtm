/**
 * F11c Unibox chat transcript — Prism contract shapes + assemblers.
 *
 * direction: "campaign" | "inbound" | "operator"
 * fromRole:  "automation" | "lead" | "operator"
 * UI: campaign + inbound LEFT, operator RIGHT.
 */
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { getDb } from "./db";

export type UniboxDirection = "campaign" | "inbound" | "operator";
export type UniboxFromRole = "automation" | "lead" | "operator";

/** Prism thread message shape — keep in sync with Unibox UI + sendUniboxReply. */
export interface UniboxThreadMessage {
  id: string;
  direction: UniboxDirection;
  fromRole: UniboxFromRole;
  fromName: string;
  fromEmail: string;
  subject: string | null;
  bodyHtml: string;
  bodyText: string;
  sentAt: string; // ISO-8601
}

export type UniboxThreadKey =
  | { replyId: string; leadId?: never; campaignId?: never }
  | { replyId?: never; leadId: string; campaignId?: string | null };

export function bubbleSide(direction: UniboxDirection): "left" | "right" {
  return direction === "operator" ? "right" : "left";
}

type Db = ReturnType<typeof getDb>;

function sortAscending(messages: UniboxThreadMessage[]): UniboxThreadMessage[] {
  return [...messages].sort((a, b) => {
    const ta = Date.parse(a.sentAt) || 0;
    const tb = Date.parse(b.sentAt) || 0;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Resolve thread anchors from replyId or leadId(+campaignId).
 * Returns null when the key does not belong to userId.
 */
export async function resolveUniboxThreadContext(
  db: Db,
  userId: string,
  key: UniboxThreadKey,
): Promise<{
  replyId: string | null;
  leadId: string | null;
  campaignId: string | null;
  senderId: string | null;
} | null> {
  if ("replyId" in key && key.replyId) {
    const [reply] = await db
      .select({
        id: schema.replies.id,
        leadId: schema.replies.leadId,
        campaignId: schema.replies.campaignId,
        senderId: schema.replies.senderId,
      })
      .from(schema.replies)
      .where(and(eq(schema.replies.id, key.replyId), eq(schema.replies.userId, userId)))
      .limit(1);
    if (!reply) return null;
    return {
      replyId: reply.id,
      leadId: reply.leadId,
      campaignId: reply.campaignId,
      senderId: reply.senderId,
    };
  }
  const leadId = key.leadId;
  if (!leadId) return null;
  const [lead] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.userId, userId)))
    .limit(1);
  if (!lead) return null;
  return {
    replyId: null,
    leadId,
    campaignId: key.campaignId ?? null,
    senderId: null,
  };
}

/** Assemble full transcript ascending: campaign outbound + inbound replies + operator. */
export async function loadUniboxThreadMessages(
  db: Db,
  userId: string,
  ctx: {
    replyId: string | null;
    leadId: string | null;
    campaignId: string | null;
  },
): Promise<UniboxThreadMessage[]> {
  const out: UniboxThreadMessage[] = [];

  // 1) Campaign outbound (sent email_jobs for this lead, optionally campaign-scoped)
  if (ctx.leadId) {
    const jobConds = [
      eq(schema.emailJobs.leadId, ctx.leadId),
      eq(schema.emailJobs.status, "sent"),
      isNotNull(schema.emailJobs.sentAt),
    ];
    if (ctx.campaignId) jobConds.push(eq(schema.emailJobs.campaignId, ctx.campaignId));

    const jobs = await db
      .select({
        id: schema.emailJobs.id,
        subject: schema.emailJobs.subject,
        bodyText: schema.emailJobs.bodyText,
        bodyHtml: schema.emailJobs.bodyHtml,
        sentAt: schema.emailJobs.sentAt,
        senderName: schema.senderAccounts.senderName,
        senderEmail: schema.senderAccounts.email,
        fromName: schema.senderAccounts.fromName,
      })
      .from(schema.emailJobs)
      .innerJoin(schema.campaigns, eq(schema.emailJobs.campaignId, schema.campaigns.id))
      .leftJoin(schema.senderAccounts, eq(schema.emailJobs.senderId, schema.senderAccounts.id))
      .where(and(eq(schema.campaigns.userId, userId), ...jobConds));

    for (const j of jobs) {
      if (!j.sentAt) continue;
      out.push({
        id: `campaign:${j.id}`,
        direction: "campaign",
        fromRole: "automation",
        fromName: (j.fromName || j.senderName || "").trim(),
        fromEmail: j.senderEmail ?? "",
        subject: j.subject || null,
        bodyHtml: j.bodyHtml || "",
        bodyText: j.bodyText || "",
        sentAt: j.sentAt,
      });
    }
  }

  // 2) Inbound replies for this lead (+ campaign if known); always include anchor reply
  {
    const replyConds = [eq(schema.replies.userId, userId)];
    if (ctx.leadId && ctx.replyId) {
      replyConds.push(
        or(eq(schema.replies.leadId, ctx.leadId), eq(schema.replies.id, ctx.replyId))!,
      );
    } else if (ctx.leadId) {
      replyConds.push(eq(schema.replies.leadId, ctx.leadId));
    } else if (ctx.replyId) {
      replyConds.push(eq(schema.replies.id, ctx.replyId));
    } else {
      // no anchor — empty inbound
      replyConds.push(sql`false`);
    }
    if (ctx.campaignId && ctx.leadId) {
      // Prefer same-campaign replies but still keep the anchor if campaign differs
      // (handled by OR on reply id above when replyId set). Narrow only when no replyId.
      if (!ctx.replyId) {
        replyConds.push(eq(schema.replies.campaignId, ctx.campaignId));
      }
    }

    const inbound = await db
      .select({
        id: schema.replies.id,
        fromName: schema.replies.fromName,
        fromEmail: schema.replies.fromEmail,
        subject: schema.replies.subject,
        bodyText: schema.replies.bodyText,
        bodyHtml: schema.replies.bodyHtml,
        receivedAt: schema.replies.receivedAt,
        campaignId: schema.replies.campaignId,
      })
      .from(schema.replies)
      .where(and(...replyConds));

    for (const r of inbound) {
      // When campaign-scoped with replyId, drop other-campaign noise except anchor
      if (ctx.campaignId && ctx.replyId && r.id !== ctx.replyId && r.campaignId && r.campaignId !== ctx.campaignId) {
        continue;
      }
      out.push({
        id: `inbound:${r.id}`,
        direction: "inbound",
        fromRole: "lead",
        fromName: r.fromName || "",
        fromEmail: r.fromEmail,
        subject: r.subject || null,
        bodyHtml: r.bodyHtml || "",
        bodyText: r.bodyText || "",
        sentAt: r.receivedAt,
      });
    }
  }

  // 3) Operator messages from unibox_messages
  {
    const opConds = [eq(schema.uniboxMessages.userId, userId), eq(schema.uniboxMessages.direction, "operator")];
    if (ctx.replyId && ctx.leadId) {
      opConds.push(
        or(eq(schema.uniboxMessages.replyId, ctx.replyId), eq(schema.uniboxMessages.leadId, ctx.leadId))!,
      );
    } else if (ctx.replyId) {
      opConds.push(eq(schema.uniboxMessages.replyId, ctx.replyId));
    } else if (ctx.leadId) {
      opConds.push(eq(schema.uniboxMessages.leadId, ctx.leadId));
    } else {
      opConds.push(sql`false`);
    }

    const ops = await db
      .select({
        id: schema.uniboxMessages.id,
        fromName: schema.uniboxMessages.fromName,
        fromEmail: schema.uniboxMessages.fromEmail,
        subject: schema.uniboxMessages.subject,
        bodyText: schema.uniboxMessages.bodyText,
        bodyHtml: schema.uniboxMessages.bodyHtml,
        sentAt: schema.uniboxMessages.sentAt,
        leadId: schema.uniboxMessages.leadId,
        campaignId: schema.uniboxMessages.campaignId,
        replyId: schema.uniboxMessages.replyId,
      })
      .from(schema.uniboxMessages)
      .where(and(...opConds));

    for (const m of ops) {
      if (
        ctx.campaignId &&
        m.campaignId &&
        m.campaignId !== ctx.campaignId &&
        m.replyId !== ctx.replyId
      ) {
        continue;
      }
      out.push({
        id: m.id.startsWith("operator:") ? m.id : `operator:${m.id}`,
        direction: "operator",
        fromRole: "operator",
        fromName: m.fromName || "",
        fromEmail: m.fromEmail || "",
        subject: m.subject,
        bodyHtml: m.bodyHtml || "",
        bodyText: m.bodyText || "",
        sentAt: m.sentAt,
      });
    }
  }

  return sortAscending(out);
}

/** Build the Prism operator message payload (also used for optimistic UI). */
export function buildOperatorThreadMessage(input: {
  id: string;
  fromName: string;
  fromEmail: string;
  subject: string | null;
  bodyText: string;
  bodyHtml?: string;
  sentAt: string;
}): UniboxThreadMessage {
  const text = input.bodyText;
  return {
    id: input.id.startsWith("operator:") ? input.id : `operator:${input.id}`,
    direction: "operator",
    fromRole: "operator",
    fromName: input.fromName,
    fromEmail: input.fromEmail,
    subject: input.subject,
    bodyHtml: input.bodyHtml ?? "",
    bodyText: text,
    sentAt: input.sentAt,
  };
}

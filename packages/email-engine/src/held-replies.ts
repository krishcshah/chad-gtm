/**
 * Replies held while the owner's account was on hold (not approved).
 *
 * The reply agent never answers for an account on hold: it marks the reply
 * 'held'. Once an admin approves the account (admin button, a script, or
 * approval turned off), the reply-agent tick calls
 * releaseHeldForApprovedOwners, which puts each held conversation in front
 * of the client as ONE Needs you card. Nothing is ever sent from here, and
 * old replies are never re-queued for the agent: they may be days old or
 * already answered.
 */
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { EngineDb } from "./db-port";
import { loadUnapprovedOwners, ownerApprovalRequired } from "./owner-approval";
import { attachReplyToOpenRequest, findOpenConversationRequest } from "./lead-conversations";

export const HELD_RELEASED_TITLE = "Arrived while your account was on hold";
export const HELD_RELEASED_SUMMARY = "Waiting on you: this arrived while your account was on hold.";
export const HELD_ANSWERED_SUMMARY = "Answered while your account was on hold.";
export const HELD_SUPERSEDED_SUMMARY = "Superseded by a newer message from this lead.";

/** Owners whose held replies are looked at per tick. */
const OWNERS_PER_TICK = 50;
/** Held replies loaded per owner per tick. */
const REPLIES_PER_OWNER = 500;

interface HeldReply {
  id: string;
  userId: string;
  leadId: string | null;
  campaignId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  receivedAt: string;
  agentStatus: string | null;
}

/** One conversation: the lead (else the sender address) in one campaign. */
export function heldConversationKey(r: { leadId: string | null; fromEmail: string; campaignId: string | null }): string {
  return `${r.leadId || String(r.fromEmail || "").trim().toLowerCase()}|${r.campaignId || ""}`;
}

function ms(at: string | null | undefined): number {
  const t = Date.parse(String(at ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/** Held replies grouped by conversation, newest reply first in each group. */
export function groupHeldReplies<T extends { leadId: string | null; fromEmail: string; campaignId: string | null; receivedAt: string }>(
  rows: readonly T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = heldConversationKey(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  return [...groups.values()].map((g) => [...g].sort((a, b) => ms(b.receivedAt) - ms(a.receivedAt)));
}

/** Did anyone write to the lead (Inbox send) at or after `since`? */
async function answeredSince(db: EngineDb, group: HeldReply[], since: string): Promise<boolean> {
  const newest = group[0]!;
  const where =
    newest.leadId && newest.campaignId
      ? and(
          eq(schema.uniboxMessages.leadId, newest.leadId),
          eq(schema.uniboxMessages.campaignId, newest.campaignId),
          eq(schema.uniboxMessages.direction, "operator"),
        )
      : and(
          inArray(
            schema.uniboxMessages.replyId,
            group.map((r) => r.id),
          ),
          eq(schema.uniboxMessages.direction, "operator"),
        );
  const rows: Array<{ sentAt: string | null }> = await db
    .select({ sentAt: schema.uniboxMessages.sentAt })
    .from(schema.uniboxMessages)
    .where(where)
    .limit(200);
  const sinceMs = ms(since);
  return rows.some((r) => r.sentAt != null && ms(r.sentAt) >= sinceMs);
}

/** Mark replies (still 'held') as settled. */
async function settle(db: EngineDb, ids: string[], intent: string, summary: string, nowIso: string): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(schema.replies)
    .set({ agentStatus: "skipped", agentIntent: intent, agentSummary: summary, agentHandledAt: nowIso })
    .where(and(inArray(schema.replies.id, ids), eq(schema.replies.agentStatus, "held")));
}

/**
 * Open one Needs you card per held conversation of `ownerId` (for its newest
 * held reply). Conversations someone answered meanwhile are settled instead,
 * and older held messages in a conversation are marked superseded. Never
 * sends. Returns the number of cards opened.
 */
export async function releaseHeldReplies(db: EngineDb, ownerId: string, now: Date): Promise<number> {
  const nowIso = now.toISOString();
  const loaded: HeldReply[] = await db
    .select({
      id: schema.replies.id,
      userId: schema.replies.userId,
      leadId: schema.replies.leadId,
      campaignId: schema.replies.campaignId,
      fromEmail: schema.replies.fromEmail,
      fromName: schema.replies.fromName,
      subject: schema.replies.subject,
      snippet: schema.replies.snippet,
      bodyText: schema.replies.bodyText,
      receivedAt: schema.replies.receivedAt,
      agentStatus: schema.replies.agentStatus,
    })
    .from(schema.replies)
    .where(and(eq(schema.replies.userId, ownerId), eq(schema.replies.agentStatus, "held")))
    .limit(REPLIES_PER_OWNER);
  const held = loaded.filter((r) => r.agentStatus === "held" && r.userId === ownerId);

  let opened = 0;
  for (const group of groupHeldReplies(held)) {
    const newest = group[0]!;
    const older = group.slice(1).map((r) => r.id);

    if (await answeredSince(db, group, newest.receivedAt)) {
      await settle(
        db,
        group.map((r) => r.id),
        "answered",
        HELD_ANSWERED_SUMMARY,
        nowIso,
      );
      continue;
    }

    // Claim the newest reply: if another worker (or a person) moved it, leave the conversation alone.
    const claimed: any[] = await db
      .update(schema.replies)
      .set({ agentStatus: "escalated", agentSummary: HELD_RELEASED_SUMMARY, agentHandledAt: nowIso })
      .where(and(eq(schema.replies.id, newest.id), eq(schema.replies.agentStatus, "held")))
      .returning({ id: schema.replies.id });
    if (claimed.length === 0) continue;
    await settle(db, older, "other", HELD_SUPERSEDED_SUMMARY, nowIso);

    // One card per conversation: join an open one instead of opening a second.
    const existing = await findOpenConversationRequest(db, {
      leadId: newest.leadId,
      campaignId: newest.campaignId,
      replyId: newest.id,
    });
    if (existing) {
      if (existing.replyId !== newest.id) await attachReplyToOpenRequest(db, existing.id, newest.id, nowIso);
      continue;
    }

    const [run]: any[] = newest.campaignId
      ? await db
          .select({ id: schema.chadGtmRuns.id, workspaceId: schema.chadGtmRuns.workspaceId })
          .from(schema.chadGtmRuns)
          .where(eq(schema.chadGtmRuns.campaignId, newest.campaignId))
          .limit(1)
      : [];
    const [campaign]: any[] =
      newest.campaignId && !run?.workspaceId
        ? await db
            .select({ workspaceId: schema.campaigns.workspaceId })
            .from(schema.campaigns)
            .where(eq(schema.campaigns.id, newest.campaignId))
            .limit(1)
        : [];
    const [lead]: any[] = newest.leadId
      ? await db
          .select({ firstName: schema.leads.firstName, lastName: schema.leads.lastName, company: schema.leads.company })
          .from(schema.leads)
          .where(eq(schema.leads.id, newest.leadId))
          .limit(1)
      : [];
    const said = String(newest.bodyText || newest.snippet || "").replace(/\s+/g, " ").trim().slice(0, 500);

    await db.insert(schema.agentRequests).values({
      id: crypto.randomUUID(),
      userId: newest.userId,
      workspaceId: run?.workspaceId ?? campaign?.workspaceId ?? null,
      runId: run?.id ?? null,
      campaignId: newest.campaignId,
      replyId: newest.id,
      leadId: newest.leadId,
      kind: "other",
      status: "open",
      title: HELD_RELEASED_TITLE,
      question: said || `${newest.fromEmail} replied (subject: ${newest.subject || "no subject"})`,
      leadEmail: newest.fromEmail,
      leadName: [lead?.firstName, lead?.lastName].filter(Boolean).join(" ") || newest.fromName || "",
      leadCompany: lead?.company || "",
      draftReply: "",
    });
    opened++;
  }
  return opened;
}

/**
 * For every owner with held replies who is approved now, open their Needs
 * you cards. Owners still on hold are left alone. Returns cards opened.
 */
export async function releaseHeldForApprovedOwners(db: EngineDb, now: Date): Promise<number> {
  // Only owners who are approved (and still exist) are picked, so owners on
  // hold can never fill the per-tick batch and starve approved ones.
  const approvedOnly = ownerApprovalRequired()
    ? or(eq(schema.users.role, "admin"), isNotNull(schema.users.approvedAt))
    : undefined;
  const rows: Array<{ userId: string | null; agentStatus: string | null }> = await db
    .select({ userId: schema.replies.userId, agentStatus: schema.replies.agentStatus })
    .from(schema.replies)
    .innerJoin(schema.users, eq(schema.users.id, schema.replies.userId))
    .where(and(eq(schema.replies.agentStatus, "held"), approvedOnly))
    .groupBy(schema.replies.userId, schema.replies.agentStatus)
    .orderBy(schema.replies.userId)
    .limit(OWNERS_PER_TICK);
  const owners = [
    ...new Set(rows.filter((r) => r.agentStatus === "held" && r.userId).map((r) => r.userId as string)),
  ];
  if (owners.length === 0) return 0;
  // A failed lookup throws: nothing is released this tick (fail closed).
  const unapproved = await loadUnapprovedOwners(db, owners);
  let opened = 0;
  for (const ownerId of owners) {
    if (unapproved.has(ownerId)) continue;
    try {
      opened += await releaseHeldReplies(db, ownerId, now);
    } catch (err) {
      console.error("[reply-agent] releasing held replies failed", ownerId, err);
    }
  }
  return opened;
}

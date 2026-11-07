/**
 * Inbound mail on shared pool mailboxes that does not thread to one lead
 * (#68, #69).
 *
 * Pool mailboxes send for every customer, so a fresh message ("new contact",
 * a forwarded colleague, the lead writing from another address) can belong to
 * anyone. It is routed to a customer only when exactly one customer is a
 * candidate; otherwise it waits in the admin triage queue (unmatched_inbound).
 * When in doubt, nothing reaches any customer's Inbox or agent.
 */
import { normalizeEmail, schema } from "@smartreach/database";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";
import type { HeaderMap } from "./inbound-classify";
import { hasWarmupMarker } from "./signature";

/** Consumer mail domains: many unrelated people share them, so they never route by domain. */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "web.de",
  "yandex.ru",
  "yandex.com",
  "mail.ru",
  "zoho.com",
  "hey.com",
  "fastmail.com",
]);

/** How far back a customer's sends to a domain count for domain routing. */
export const DOMAIN_ROUTING_WINDOW_DAYS = 30;

const AUTOMATED_SENDER_RE = /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?)(?:[+._-][^@]*)?@/i;

export function isFreeMailDomain(domain: string): boolean {
  return FREE_MAIL_DOMAINS.has(String(domain ?? "").trim().toLowerCase());
}

/** Lowercased domain of an address ('' when there is none). */
export function domainOf(email: string): string {
  const n = normalizeEmail(String(email ?? ""));
  const at = n.lastIndexOf("@");
  return at >= 0 ? n.slice(at + 1) : "";
}

/**
 * Is an unmatched message one a person wrote, worth an admin's look? Mailing
 * lists, bulk mail, auto-replies, system senders, warm-up traffic and mail
 * from our own mailboxes are not.
 */
export function isTriageCandidate(input: {
  headers: HeaderMap;
  subject: string;
  bodyText: string;
  fromEmail: string;
  autoReply: boolean;
  isOwnMailbox: boolean;
}): boolean {
  if (input.autoReply || input.isOwnMailbox) return false;
  const headers = input.headers ?? {};
  if (headers["list-id"] !== undefined || headers["list-unsubscribe"] !== undefined) return false;
  const precedence = String(headers["precedence"] ?? "").trim().toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return false;
  const from = normalizeEmail(String(input.fromEmail ?? ""));
  if (!from || !from.includes("@")) return false;
  if (AUTOMATED_SENDER_RE.test(from)) return false;
  if (hasWarmupMarker(input.bodyText) || hasWarmupMarker(input.subject)) return false;
  return true;
}

/** A customer who emailed an address or domain from a mailbox, with their newest job. */
export interface InboundOwner {
  userId: string;
  campaignId: string;
  workspaceId: string | null;
  /** Newest job's lead (address matches only). */
  leadId?: string | null;
  jobId?: string | null;
  sentAt?: string | null;
}

/** The one owner, or null when there are none or several. */
export function pickUnambiguousOwner<T extends { userId: string }>(owners: T[]): T | null {
  const ids = new Set(owners.map((o) => o.userId).filter(Boolean));
  if (ids.size !== 1) return null;
  return owners.find((o) => o.userId) ?? null;
}

export type UnmatchedRoute =
  | { kind: "route"; owner: InboundOwner }
  | { kind: "triage"; candidateUserIds: string[] };

/**
 * Route a new contact by domain only when the domain is not free mail and
 * exactly one customer emailed it from this mailbox in the window.
 */
export function routeUnmatched(input: { domain: string; owners: InboundOwner[] }): UnmatchedRoute {
  const candidateUserIds = [...new Set(input.owners.map((o) => o.userId).filter(Boolean))];
  const domain = String(input.domain ?? "").trim().toLowerCase();
  if (domain && !isFreeMailDomain(domain)) {
    const owner = pickUnambiguousOwner(input.owners);
    if (owner) return { kind: "route", owner };
  }
  return { kind: "triage", candidateUserIds };
}

/** One row per customer, keeping their newest job (rows come newest first). */
function newestPerOwner(rows: InboundOwner[]): InboundOwner[] {
  const out = new Map<string, InboundOwner>();
  for (const r of rows) {
    if (!r.userId || out.has(r.userId)) continue;
    out.set(r.userId, r);
  }
  return [...out.values()];
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Customers whose campaigns sent (or bounced) mail from this mailbox to any
 * address at `domain` since `sinceIso`, each with their newest such job.
 * DISTINCT ON keeps every customer however many jobs the others have.
 */
export async function loadDomainOwners(
  db: EngineDb,
  senderId: string,
  domain: string,
  sinceIso: string,
): Promise<InboundOwner[]> {
  const d = String(domain ?? "").trim().toLowerCase();
  if (!senderId || !d) return [];
  const rows: InboundOwner[] = await db
    .selectDistinctOn([schema.campaigns.userId], {
      userId: schema.campaigns.userId,
      campaignId: schema.emailJobs.campaignId,
      workspaceId: schema.campaigns.workspaceId,
      jobId: schema.emailJobs.id,
      sentAt: schema.emailJobs.sentAt,
    })
    .from(schema.emailJobs)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.emailJobs.campaignId))
    .where(
      and(
        eq(schema.emailJobs.senderId, senderId),
        inArray(schema.emailJobs.status, ["sent", "bounced"]),
        sql`lower(${schema.emailJobs.toEmail}) like ${`%@${escapeLike(d)}`}`,
        gte(schema.emailJobs.sentAt, sinceIso),
      ),
    )
    .orderBy(schema.campaigns.userId, desc(schema.emailJobs.sentAt));
  return newestPerOwner(rows ?? []);
}

/**
 * Customers whose campaigns sent this exact address mail from this mailbox,
 * each with their newest such job (the From fallback when a reply does not
 * thread).
 */
export async function loadAddressOwners(db: EngineDb, senderId: string, fromEmail: string): Promise<InboundOwner[]> {
  const email = normalizeEmail(String(fromEmail ?? ""));
  if (!senderId || !email) return [];
  const rows: InboundOwner[] = await db
    .selectDistinctOn([schema.campaigns.userId], {
      userId: schema.campaigns.userId,
      campaignId: schema.emailJobs.campaignId,
      workspaceId: schema.campaigns.workspaceId,
      leadId: schema.emailJobs.leadId,
      jobId: schema.emailJobs.id,
      sentAt: schema.emailJobs.sentAt,
    })
    .from(schema.emailJobs)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.emailJobs.campaignId))
    .where(
      and(
        eq(schema.emailJobs.senderId, senderId),
        sql`lower(${schema.emailJobs.toEmail}) = ${email}`,
        eq(schema.emailJobs.status, "sent"),
      ),
    )
    .orderBy(schema.campaigns.userId, desc(schema.emailJobs.sentAt));
  return newestPerOwner(rows ?? []);
}

/** Is this address one of our own mailboxes (pool or customer)? */
export async function isOwnMailboxAddress(db: EngineDb, email: string): Promise<boolean> {
  const n = normalizeEmail(String(email ?? ""));
  if (!n) return false;
  const rows: { id: string }[] = await db
    .select({ id: schema.senderAccounts.id })
    .from(schema.senderAccounts)
    .where(sql`lower(${schema.senderAccounts.email}) = ${n}`)
    .limit(1);
  return rows.length > 0;
}

export interface UnmatchedInboundRow {
  senderId: string;
  messageId: string | null;
  fromEmail: string;
  fromName?: string;
  subject?: string;
  snippet?: string;
  bodyText?: string;
  bodyHtml?: string;
  receivedAt: string;
  candidateUserIds?: string[];
  reason: "no_match" | "ambiguous_owner";
}

/**
 * Queue a message for admin triage. Idempotent per (mailbox, Message-ID); a
 * message without a Message-ID is matched on sender address + time instead,
 * since sync re-reads the last hour every poll.
 */
export async function insertUnmatchedInbound(db: EngineDb, row: UnmatchedInboundRow): Promise<void> {
  if (!row.messageId) {
    const existing: { id: string }[] = await db
      .select({ id: schema.unmatchedInbound.id })
      .from(schema.unmatchedInbound)
      .where(
        and(
          eq(schema.unmatchedInbound.senderId, row.senderId),
          eq(schema.unmatchedInbound.fromEmail, row.fromEmail),
          eq(schema.unmatchedInbound.receivedAt, row.receivedAt),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
  }
  await db
    .insert(schema.unmatchedInbound)
    .values({
      id: crypto.randomUUID(),
      senderId: row.senderId,
      messageId: row.messageId,
      fromEmail: row.fromEmail,
      fromName: row.fromName ?? "",
      subject: row.subject ?? "",
      snippet: row.snippet ?? "",
      bodyText: row.bodyText ?? "",
      bodyHtml: row.bodyHtml ?? "",
      receivedAt: row.receivedAt,
      candidateUserIds: [...new Set(row.candidateUserIds ?? [])],
      reason: row.reason,
      status: "open",
    })
    .onConflictDoNothing({ target: [schema.unmatchedInbound.senderId, schema.unmatchedInbound.messageId] });
}

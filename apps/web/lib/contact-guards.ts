/**
 * Who must not be emailed: the cross-client re-contact cooldown and opt-outs.
 *
 * Deliberately NOT a "use server" module: these helpers take a trusted user id
 * and must never be callable from the browser. gtm-launch.ts re-exports them.
 */
import { and, eq, gte, inArray, max, sql } from "drizzle-orm";
import {
  applicableSuppressionValues,
  matchesSuppression,
  schema,
  suppressionCandidates,
} from "@smartreach/database";
import type { Db } from "./db";

/** How long a prospect is off-limits to every client after one campaign touches them. */
export const CONTACT_COOLDOWN_DAYS = 90;

const CHUNK = 500;

function cooldownStart(now: Date): string {
  return new Date(now.getTime() - CONTACT_COOLDOWN_DAYS * 86_400_000).toISOString();
}

/**
 * Emails any client already put into a campaign inside the cooldown window.
 * Every client shares the same mailbox pool, so contacting one prospect from
 * two campaigns burns pool reputation and annoys the prospect.
 *
 * Reads live campaigns (matched case-insensitively) and the permanent
 * contact_history ledger, which keeps contacts of deleted workspaces and
 * accounts.
 */
export async function recentlyContactedEmails(db: Db, emails: string[], now = new Date()): Promise<Set<string>> {
  const out = new Set<string>();
  const normalized = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))];
  if (normalized.length === 0) return out;
  const since = cooldownStart(now);
  for (let i = 0; i < normalized.length; i += CHUNK) {
    const batch = normalized.slice(i, i + CHUNK);
    const contacted = sql`(
      select lower(${schema.leads.email}) as email
      from ${schema.leads}
      inner join ${schema.campaignLeads} on ${schema.campaignLeads.leadId} = ${schema.leads.id}
      where ${inArray(sql`lower(${schema.leads.email})`, batch)} and ${gte(schema.campaignLeads.createdAt, since)}
      union
      select ${schema.contactHistory.email} as email
      from ${schema.contactHistory}
      where ${inArray(schema.contactHistory.email, batch)} and ${gte(schema.contactHistory.contactedAt, since)}
    ) as contacted`;
    const rows: Array<{ email: string | null }> = await db
      .select({ email: sql<string | null>`contacted.email` })
      .from(contacted);
    for (const r of rows) if (r.email) out.add(r.email.toLowerCase());
  }
  return out;
}

/**
 * Before deleting an account or workspace, copy its recent contacts into the
 * permanent contact_history ledger so the 90-day cooldown still protects
 * those people after the campaigns are gone. Throws on a database error: the
 * caller must not delete anything then.
 */
export async function recordContactHistory(
  db: Db,
  scope: { userId: string; workspaceId?: string },
  now = new Date(),
): Promise<number> {
  const since = cooldownStart(now);
  const rows: Array<{ email: string | null; contactedAt: string | null }> = await db
    .select({
      email: sql<string | null>`lower(${schema.leads.email})`,
      contactedAt: max(schema.campaignLeads.createdAt),
    })
    .from(schema.campaignLeads)
    .innerJoin(schema.leads, eq(schema.campaignLeads.leadId, schema.leads.id))
    .where(
      and(
        eq(schema.leads.userId, scope.userId),
        scope.workspaceId ? eq(schema.leads.workspaceId, scope.workspaceId) : undefined,
        gte(schema.campaignLeads.createdAt, since),
      ),
    )
    .groupBy(sql`lower(${schema.leads.email})`);

  const values = rows
    .filter((r): r is { email: string; contactedAt: string } => Boolean(r.email && r.contactedAt))
    .map((r) => ({ id: crypto.randomUUID(), email: r.email.trim().toLowerCase(), contactedAt: r.contactedAt }));
  for (let i = 0; i < values.length; i += CHUNK) {
    await db.insert(schema.contactHistory).values(values.slice(i, i + CHUNK));
  }
  return values.length;
}

/**
 * Emails that must not be provisioned for `userId`: the owner's own
 * suppressions (any source) plus everyone's global opt-outs (unsubscribe,
 * bounce, complaint, erasure; see GLOBAL_SUPPRESSION_SOURCES), matched by
 * address or "@domain". Same rule as the engine's send-time check.
 */
export async function suppressedEmailsFor(db: Db, userId: string, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const normalized = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))];
  if (normalized.length === 0) return out;
  const candidates = [...new Set(normalized.flatMap(suppressionCandidates))];
  const rows: Array<{ value: string; userId: string | null; source: string | null }> = [];
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const batch = candidates.slice(i, i + CHUNK);
    const found = await db
      .select({
        value: schema.suppressions.value,
        userId: schema.suppressions.userId,
        source: schema.suppressions.source,
      })
      .from(schema.suppressions)
      .where(inArray(sql`lower(${schema.suppressions.value})`, batch));
    rows.push(...found);
  }
  const values = applicableSuppressionValues(rows, userId);
  if (values.length === 0) return out;
  for (const email of normalized) {
    if (matchesSuppression(email, values)) out.add(email);
  }
  return out;
}

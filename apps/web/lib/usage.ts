/**
 * Usage and cost. Every email sent counts, follow-ups included: one lead
 * gets three emails (outreach, then follow-ups two and four days later), so
 * leads contacted is roughly a third of emails sent.
 *
 * Counts come from email_jobs (status "sent", never dry runs), joined to the
 * owner's campaigns. Campaigns are soft-deleted, so history survives a
 * campaign being removed.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";

/** OWNER: price per email sent, in US cents. Keep in sync with the landing page. */
export const PRICE_CENTS_PER_EMAIL = 5;
/** Outreach plus two follow-ups. */
export const EMAILS_PER_LEAD = 3;
/** Sending runs Monday to Friday. */
export const SENDING_DAYS_PER_MONTH = 22;

export interface Usage {
  /** Start of the period (UTC, inclusive) and end (exclusive). */
  from: string;
  to: string;
  emailsSent: number;
  /** Leads who got their first email in the period. */
  leadsContacted: number;
  followUpsSent: number;
  costCents: number;
}

export function monthBounds(now = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function costCents(emails: number): number {
  return Math.max(0, Math.round(emails)) * PRICE_CENTS_PER_EMAIL;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** What a daily volume adds up to over a month of sending days. */
export function forecastFromDailyVolume(perDay: number) {
  const emails = Math.max(0, Math.round(perDay)) * SENDING_DAYS_PER_MONTH;
  return {
    emailsPerMonth: emails,
    newLeadsPerDay: Math.floor(perDay / EMAILS_PER_LEAD),
    leadsPerMonth: Math.round(emails / EMAILS_PER_LEAD),
    costCentsPerMonth: costCents(emails),
  };
}

/** Emails sent, leads contacted and cost for an owner (optionally one workspace) this month. */
export async function getMonthlyUsage(
  db: any,
  input: { userId: string; workspaceId?: string | null; now?: Date },
): Promise<Usage> {
  const { from, to } = monthBounds(input.now);
  const filters = [
    eq(schema.campaigns.userId, input.userId),
    eq(schema.emailJobs.status, "sent"),
    eq(schema.emailJobs.dryRun, false),
    gte(schema.emailJobs.sentAt, from),
    lt(schema.emailJobs.sentAt, to),
  ];
  if (input.workspaceId) filters.push(eq(schema.campaigns.workspaceId, input.workspaceId));
  const rows: Array<{ emails: number; first: number }> = await db
    .select({
      emails: sql<number>`count(*)`,
      first: sql<number>`count(*) filter (where ${schema.emailJobs.stepPosition} = 1)`,
    })
    .from(schema.emailJobs)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.emailJobs.campaignId))
    .where(and(...filters));
  const emailsSent = Number(rows[0]?.emails ?? 0);
  const leadsContacted = Number(rows[0]?.first ?? 0);
  return {
    from,
    to,
    emailsSent,
    leadsContacted,
    followUpsSent: Math.max(0, emailsSent - leadsContacted),
    costCents: costCents(emailsSent),
  };
}

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

import { costCents, monthBounds } from "./pricing";

export {
  EMAILS_PER_LEAD,
  PRICE_CENTS_PER_EMAIL,
  SENDING_DAYS_PER_MONTH,
  costCents,
  forecastFromDailyVolume,
  formatCents,
  formatCost,
  monthBounds,
} from "./pricing";

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

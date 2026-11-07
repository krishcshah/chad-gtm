/**
 * Which of a list's leads a manual campaign may email (#31).
 *
 * The snapshot a campaign takes when it starts leaves out:
 * - deleted leads;
 * - leads already emailed ('contacted'), unless the person chose "Email them
 *   again";
 * - anyone queued right now in another live campaign of the same owner (no
 *   two sequences to one person in parallel);
 * - unless re-engaging, anyone the owner's other campaigns took in during the
 *   last CONTACT_COOLDOWN_DAYS days (per owner; the cross-customer cooldown is
 *   Autopilot's).
 *
 * Emails are compared with plain equality: they are stored lowercased, so
 * leads_email_idx is used. Suppressions are still checked at queue and send
 * time; listSendabilityCounts also leaves them out so the wizard's count is
 * honest.
 *
 * Not a "use server" module: helpers take a db and a trusted owner id.
 */
import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { GLOBAL_SUPPRESSION_SOURCES, schema } from "@smartreach/database";
import { CONTACT_COOLDOWN_DAYS } from "./contact-guards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const { leads, campaigns, campaignLeads, suppressions } = schema;

const otherLead = alias(leads, "sendability_other_lead");
const otherCampaign = alias(campaigns, "sendability_other_campaign");
const otherCampaignLead = alias(campaignLeads, "sendability_other_campaign_lead");

/** Campaign statuses that can still send. */
export const ACTIVE_CAMPAIGN_STATUSES = ["running", "scheduled", "paused"] as const;

/** Start of the per-owner re-contact window. */
export function contactCooldownSince(now: Date = new Date()): string {
  return new Date(now.getTime() - CONTACT_COOLDOWN_DAYS * 86_400_000).toISOString();
}

/** SQL condition over `leads` for leads a campaign snapshot may take. */
export function snapshotLeadWhere(opts: {
  ownerId: string;
  /** The campaign taking the snapshot (its own rows don't count against it). */
  campaignId: string | null;
  reengageContacted: boolean;
  /** contactCooldownSince(); rows created at or after this count as recent contact. */
  since: string;
}): SQL {
  const notThisCampaign = opts.campaignId ? sql` and ${otherCampaign.id} <> ${opts.campaignId}` : sql``;
  // An aliased table renders as its alias only, so name the real table first.
  const otherRowsForPerson = sql`from ${campaignLeads} ${otherCampaignLead}
      inner join ${leads} ${otherLead} on ${otherLead.id} = ${otherCampaignLead.leadId}
      inner join ${campaigns} ${otherCampaign} on ${otherCampaign.id} = ${otherCampaignLead.campaignId}
      where ${otherLead.email} = ${leads.email} and ${otherCampaign.userId} = ${opts.ownerId}${notThisCampaign}`;

  // No parallel sequences: someone still queued in another live campaign.
  const notInActiveCampaign = sql`not exists (select 1 ${otherRowsForPerson}
      and ${otherCampaign.deletedAt} is null
      and ${otherCampaign.status} in (${sql.join(
        ACTIVE_CAMPAIGN_STATUSES.map((s) => sql`${s}`),
        sql`, `,
      )})
      and ${otherCampaignLead.status} in ('queued', 'scheduled'))`;

  const conds: SQL[] = [
    isNull(leads.deletedAt),
    inArray(leads.status, opts.reengageContacted ? ["new", "contacted"] : ["new"]),
    notInActiveCampaign,
  ];
  if (!opts.reengageContacted) {
    // Your other campaigns took this person in recently.
    conds.push(sql`not exists (select 1 ${otherRowsForPerson}
      and ${otherCampaignLead.createdAt} >= ${opts.since})`);
  }
  return and(...conds)!;
}

/** Not on the owner's blocklist and not globally opted out (address or domain). */
export function notSuppressedLeadWhere(ownerId: string): SQL {
  return sql`not exists (
    select 1 from ${suppressions}
    where (${suppressions.userId} = ${ownerId} or ${suppressions.source} in (${sql.join(
      GLOBAL_SUPPRESSION_SOURCES.map((s) => sql`${s}`),
      sql`, `,
    )}))
      and (${suppressions.value} = ${leads.email}
        or ${suppressions.value} = '@' || split_part(${leads.email}, '@', 2))
  )`;
}

/**
 * List leads that "Add N new leads" adds to a campaign that already took its
 * copy (#40): still 'new', the snapshot rules above, not on a blocklist, and
 * no lead with the same address already in the campaign. The button's count
 * and the action both use this, and both count each address once
 * (missingListLeadsCountSql), so "Add 5" adds 5.
 */
export function missingListLeadsWhere(opts: {
  ownerId: string;
  campaignId: string;
  leadListId: string;
  reengageContacted?: boolean;
  since: string;
}): SQL {
  return and(
    eq(leads.listId, opts.leadListId),
    eq(leads.status, "new"),
    snapshotLeadWhere({
      ownerId: opts.ownerId,
      campaignId: opts.campaignId,
      reengageContacted: opts.reengageContacted === true,
      since: opts.since,
    }),
    notSuppressedLeadWhere(opts.ownerId),
    // The inner leads row is aliased so "leads" still means the outer row.
    sql`not exists (
      select 1 from ${campaignLeads}
      inner join ${leads} as snapshot_other_lead on snapshot_other_lead.id = ${campaignLeads.leadId}
      where ${campaignLeads.campaignId} = ${opts.campaignId} and lower(snapshot_other_lead.email) = lower(${leads.email})
    )`,
  )!;
}

/** How many distinct addresses missingListLeadsWhere matches (same dedupe as the action). */
export function missingListLeadsCountSql(where: SQL): SQL<number> {
  return sql<number>`(
    select count(distinct lower(trim(${leads.email})))::int from ${leads} where ${where}
  )`;
}

export interface ListSendability {
  /** Leads a new campaign on this list would email with the default rules. */
  sendable: number;
  /** Leads left out because your other campaigns already emailed them ("Email them again" adds them). */
  contacted: number;
}

/** Per list: how many leads a new manual campaign would email, and how many re-engaging would add. */
export async function listSendabilityCounts(
  db: Db,
  ownerId: string,
  listIds: string[],
  now: Date = new Date(),
): Promise<Map<string, ListSendability>> {
  const out = new Map<string, ListSendability>();
  const ids = [...new Set(listIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const since = contactCooldownSince(now);
  const notSuppressed = notSuppressedLeadWhere(ownerId);
  const sendable = and(
    snapshotLeadWhere({ ownerId, campaignId: null, reengageContacted: false, since }),
    notSuppressed,
  )!;
  const withReengage = and(
    snapshotLeadWhere({ ownerId, campaignId: null, reengageContacted: true, since }),
    notSuppressed,
  )!;
  const rows: Array<{ listId: string | null; sendable: number | string | null; reengage: number | string | null }> =
    await db
      .select({
        listId: leads.listId,
        sendable: sql<number>`count(*) filter (where ${sendable})`,
        reengage: sql<number>`count(*) filter (where ${withReengage})`,
      })
      .from(leads)
      .where(and(inArray(leads.listId, ids), sql`${leads.userId} = ${ownerId}`, isNull(leads.deletedAt)))
      .groupBy(leads.listId);
  for (const r of rows) {
    if (!r.listId) continue;
    const s = Number(r.sendable ?? 0);
    const all = Number(r.reengage ?? 0);
    out.set(r.listId, { sendable: s, contacted: Math.max(0, all - s) });
  }
  return out;
}

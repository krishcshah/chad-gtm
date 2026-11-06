/**
 * Pool campaigns are locked for non-admins.
 *
 * Autopilot campaigns send from the shared system-pool mailboxes. Their audience
 * (lead list) and copy (template, sequence steps) are chosen by the autopilot
 * launcher, which enforces the audience and compliance rules. If a client could
 * import their own leads into that list, edit those leads, or rewrite the
 * template/sequence, they could send arbitrary content to arbitrary addresses
 * from the shared pool. So for non-admins every such edit is refused when the
 * target list/template/campaign is used by a campaign that has a pool mailbox
 * attached. Booking link and reply-agent settings stay editable (separate
 * actions, not guarded here).
 *
 * Not a "use server" module: helpers take a db and trusted ids.
 */
import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";

const { campaigns, campaignSenders, senderAccounts, leads } = schema;

export const POOL_CAMPAIGN_LOCKED_ERROR =
  "This list or copy belongs to an AutoGTM autopilot campaign that sends from shared mailboxes, so it can't be edited here. You can still change the booking link and reply-agent settings. Create a separate campaign with your own mailbox to send your own leads or copy.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Pure decision: refuse for non-admins when the target is used by a pool campaign. */
export function poolContentEditError(opts: { isAdmin: boolean; usedByPoolCampaign: boolean }): string | null {
  if (opts.isAdmin) return null;
  return opts.usedByPoolCampaign ? POOL_CAMPAIGN_LOCKED_ERROR : null;
}

type CampaignFilter = { campaignId?: string; leadListId?: string; templateId?: string };

/** True when a live (not deleted) campaign matching the filter has a pool mailbox attached. */
async function poolCampaignExists(db: Db, filter: CampaignFilter): Promise<boolean> {
  const conds = [isNull(campaigns.deletedAt), eq(senderAccounts.isSystemPool, true)];
  if (filter.campaignId) conds.push(eq(campaigns.id, filter.campaignId));
  if (filter.leadListId) conds.push(eq(campaigns.leadListId, filter.leadListId));
  if (filter.templateId) conds.push(eq(campaigns.templateId, filter.templateId));
  const rows: Array<{ id: string }> = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .innerJoin(campaignSenders, eq(campaignSenders.campaignId, campaigns.id))
    .innerJoin(senderAccounts, eq(senderAccounts.id, campaignSenders.senderId))
    .where(and(...conds))
    .limit(1);
  return rows.length > 0;
}

export function campaignUsesPoolSenders(db: Db, campaignId: string): Promise<boolean> {
  if (!campaignId) return Promise.resolve(false);
  return poolCampaignExists(db, { campaignId });
}

export function listUsedByPoolCampaign(db: Db, leadListId: string): Promise<boolean> {
  if (!leadListId) return Promise.resolve(false);
  return poolCampaignExists(db, { leadListId });
}

export function templateUsedByPoolCampaign(db: Db, templateId: string): Promise<boolean> {
  if (!templateId) return Promise.resolve(false);
  return poolCampaignExists(db, { templateId });
}

/** The list a lead belongs to (owner-scoped), or null. */
async function leadListIdOf(db: Db, userId: string, leadId: string): Promise<string | null> {
  const [row]: Array<{ listId: string | null }> = await db
    .select({ listId: leads.listId })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)))
    .limit(1);
  return row?.listId ?? null;
}

type Actor = { id: string; isAdmin: boolean };

/** Error when `actor` may not add leads to (or import into) this list. */
export async function poolListEditError(db: Db, actor: Actor, leadListId: string | null | undefined): Promise<string | null> {
  if (actor.isAdmin || !leadListId) return null;
  return poolContentEditError({ isAdmin: false, usedByPoolCampaign: await listUsedByPoolCampaign(db, leadListId) });
}

/** Error when `actor` may not edit this lead (it sits in a pool campaign's list). */
export async function poolLeadEditError(db: Db, actor: Actor, leadId: string): Promise<string | null> {
  if (actor.isAdmin || !leadId) return null;
  return poolListEditError(db, actor, await leadListIdOf(db, actor.id, leadId));
}

/** Error when `actor` may not edit this template. */
export async function poolTemplateEditError(db: Db, actor: Actor, templateId: string | null | undefined): Promise<string | null> {
  if (actor.isAdmin || !templateId) return null;
  return poolContentEditError({ isAdmin: false, usedByPoolCampaign: await templateUsedByPoolCampaign(db, templateId) });
}

/** Error when `actor` may not edit this campaign's sequence/list/template. */
export async function poolCampaignEditError(db: Db, actor: Actor, campaignId: string | null | undefined): Promise<string | null> {
  if (actor.isAdmin || !campaignId) return null;
  return poolContentEditError({ isAdmin: false, usedByPoolCampaign: await campaignUsesPoolSenders(db, campaignId) });
}

/**
 * A lead list can't be deleted while a campaign is still sending to it.
 *
 * Deleting the list deletes its leads, and the engine cancels every pending
 * email to a deleted lead, so a running campaign would silently stop. The
 * person archives those campaigns first, then deletes the list.
 *
 * Not a "use server" module: helpers take a db and a trusted owner id.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Campaign statuses that can still send. */
export const LIST_IN_USE_CAMPAIGN_STATUSES = ["running", "scheduled", "paused"] as const;

export interface ActiveListCampaign {
  id: string;
  name: string;
  status: string;
  isAutopilot: boolean;
}

/** The owner's live campaigns that still send to this list. Errors propagate. */
export async function activeCampaignsForList(db: Db, ownerId: string, listId: string): Promise<ActiveListCampaign[]> {
  const { campaigns, chadGtmRuns } = schema;
  const rows: Array<{ id: string; name: string; status: string; isAutopilot: boolean | null }> = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      status: campaigns.status,
      isAutopilot: sql<boolean>`exists (select 1 from ${chadGtmRuns} where ${chadGtmRuns.campaignId} = ${campaigns.id})`,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.leadListId, listId),
        eq(campaigns.userId, ownerId),
        isNull(campaigns.deletedAt),
        inArray(campaigns.status, [...LIST_IN_USE_CAMPAIGN_STATUSES]),
      ),
    );
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, isAutopilot: Boolean(r.isAutopilot) }));
}

/** Why the list can't be deleted yet, or null when it can. */
export function listDeleteError(active: ReadonlyArray<Pick<ActiveListCampaign, "name">>): string | null {
  const n = active.length;
  if (n === 0) return null;
  const names = active.map((c) => `"${c.name}"`);
  const joined = n === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[n - 1]}`;
  return `${joined} still use${n === 1 ? "s" : ""} this list. Archive ${n === 1 ? "it" : "them"} first, then delete the list.`;
}

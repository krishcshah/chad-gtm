"use server";

/**
 * "Add N new leads" on a campaign page (#40). A campaign emails a copy of
 * its lead list taken when it started; this adds the list's leads that
 * arrived later. Nothing is sent here: the scheduler applies every gate
 * (suppressions, opt-outs, approval, postal address, caps) as usual.
 */
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { requireUser } from "./session";
import { isAdmin } from "./admin";
import { ensureCampaignLeadSnapshot } from "./campaign-drafts";
import { poolCampaignEditError } from "./pool-campaign-guard";
import type { ActionResult } from "./actions";

const { campaigns, leadLists, activityLogs } = schema;

const OPEN_STATUSES = ["running", "scheduled", "paused"] as const;

export async function addNewListLeadsToCampaignAction(campaignId: string): Promise<ActionResult<{ added: number }>> {
  const user = await requireUser();
  if (typeof campaignId !== "string" || !campaignId) return { ok: false, error: "Campaign not found" };
  const db = getDb();
  try {
    const [c] = await db
      .select({ id: campaigns.id, name: campaigns.name, leadListId: campaigns.leadListId })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, campaignId),
          eq(campaigns.userId, user.id),
          isNull(campaigns.deletedAt),
          inArray(campaigns.status, [...OPEN_STATUSES]),
        ),
      )
      .limit(1);
    if (!c) return { ok: false, error: "Only a running, scheduled or paused campaign can take new leads." };
    if (!c.leadListId) return { ok: false, error: "This campaign has no lead list." };

    const [list] = await db
      .select({ id: leadLists.id, deletedAt: leadLists.deletedAt })
      .from(leadLists)
      .where(and(eq(leadLists.id, c.leadListId), eq(leadLists.userId, user.id)))
      .limit(1);
    if (!list || list.deletedAt) return { ok: false, error: "Its lead list was deleted." };

    const poolError = await poolCampaignEditError(db, { id: user.id, isAdmin: isAdmin(user) }, c.id);
    if (poolError) return { ok: false, error: poolError };

    const added = await ensureCampaignLeadSnapshot(db, c.id, list.id, { onlyMissing: true });
    if (added > 0) {
      await db
        .insert(activityLogs)
        .values({
          userId: user.id,
          type: "campaign.leads_added",
          message: `Added ${added} new ${added === 1 ? "lead" : "leads"} from its list to "${c.name}"`,
          campaignId: c.id,
          meta: { added, leadListId: list.id },
        })
        .catch(() => {});
    }
    revalidatePath(`/campaigns/${c.id}`);
    return {
      ok: true,
      data: { added },
      message:
        added > 0
          ? `Added ${added.toLocaleString()} ${added === 1 ? "lead" : "leads"} to this campaign`
          : "No new leads to add. They were already in this campaign or have been emailed.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the new leads" };
  }
}

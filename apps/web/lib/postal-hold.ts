import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { loadWorkspaceProfile, schema } from "@smartreach/database";
import { POSTAL_ADDRESS_HOLD_REASON } from "@smartreach/email-engine/processor";
import { isUsablePostalAddress } from "@smartreach/shared";
import { getDb } from "./db";
import { wsCondition } from "./queries";
import { getActiveWorkspace } from "./workspaces";
import {
  NO_POSTAL_HOLD,
  SENDING_CAMPAIGN_STATUSES,
  isPostalAddressMissing,
  postalHoldFrom,
  type PostalHoldState,
} from "./postal-hold-policy";

/**
 * Sends are held when the campaign's workspace has no postal address: the
 * scheduler stops enqueueing ("missing-postal-address") and the processor puts
 * already-queued jobs back with last_error = POSTAL_ADDRESS_HOLD_REASON. Both
 * engine sides read the campaign's workspace through loadWorkspaceProfile, so
 * so do we.
 *
 * Without a visible notice those campaigns still look "running"/"Live" while
 * nothing goes out.
 */

export * from "./postal-hold-policy";

/**
 * Loads the hold for one campaign (its workspace's address), one workspace,
 * or, with neither, the active workspace. Never throws: a failed lookup just
 * hides the notice.
 */
export async function getPostalHold(
  userId: string,
  opts: { campaignId?: string; workspaceId?: string | null; isDefault?: boolean } = {},
): Promise<PostalHoldState> {
  try {
    const db = getDb();
    let workspaceId: string | null;
    if (opts.campaignId) {
      const [campaign] = await db
        .select({ workspaceId: schema.campaigns.workspaceId })
        .from(schema.campaigns)
        .where(and(eq(schema.campaigns.id, opts.campaignId), eq(schema.campaigns.userId, userId)))
        .limit(1);
      workspaceId = campaign?.workspaceId ?? null;
    } else if (opts.workspaceId !== undefined) {
      workspaceId = opts.workspaceId;
    } else {
      workspaceId = (await getActiveWorkspace(userId)).id;
    }
    const profile = await loadWorkspaceProfile(db, { userId, workspaceId });
    const settings = { postalAddress: profile.postalAddress };
    // A workspace that was asked for but not found scopes to itself (nothing),
    // never to every campaign of the account.
    const requestedId = workspaceId && workspaceId !== "primary-default" ? workspaceId : undefined;
    const campaignScope = and(
      eq(schema.campaigns.userId, userId),
      isNull(schema.campaigns.deletedAt),
      opts.campaignId
        ? eq(schema.campaigns.id, opts.campaignId)
        : wsCondition(
            schema.campaigns.workspaceId,
            profile.workspaceId ?? requestedId,
            profile.workspaceId ? profile.isDefault || opts.isDefault === true : false,
          ),
    );
    if (!isPostalAddressMissing(settings?.postalAddress)) {
      // Saved but incomplete: the engine still sends (it only holds a blank
      // address), but campaigns can't start or resume until it's fixed.
      if (isUsablePostalAddress(settings?.postalAddress)) return NO_POSTAL_HOLD;
      const [sending] = await db
        .select({ n: count() })
        .from(schema.campaigns)
        .where(and(campaignScope, inArray(schema.campaigns.status, [...SENDING_CAMPAIGN_STATUSES])));
      const n = Number(sending?.n ?? 0);
      return n > 0 ? { held: false, campaigns: n, heldJobs: 0, incomplete: true } : NO_POSTAL_HOLD;
    }
    const [[sending], [jobs]] = await Promise.all([
      db
        .select({ n: count() })
        .from(schema.campaigns)
        .where(and(campaignScope, inArray(schema.campaigns.status, [...SENDING_CAMPAIGN_STATUSES]))),
      db
        .select({ n: count() })
        .from(schema.emailJobs)
        .innerJoin(schema.campaigns, eq(schema.emailJobs.campaignId, schema.campaigns.id))
        .where(
          and(
            campaignScope,
            inArray(schema.emailJobs.status, ["pending", "retry"]),
            eq(schema.emailJobs.lastError, POSTAL_ADDRESS_HOLD_REASON),
          ),
        ),
    ]);
    return postalHoldFrom({
      postalAddress: settings?.postalAddress,
      sendingCampaigns: Number(sending?.n ?? 0),
      heldJobs: Number(jobs?.n ?? 0),
    });
  } catch (err) {
    console.error("[postal-hold] lookup failed:", err instanceof Error ? err.message : err);
    return NO_POSTAL_HOLD;
  }
}

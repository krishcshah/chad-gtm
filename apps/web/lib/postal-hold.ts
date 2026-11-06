import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { POSTAL_ADDRESS_HOLD_REASON } from "@smartreach/email-engine/processor";
import { getDb } from "./db";
import {
  NO_POSTAL_HOLD,
  SENDING_CAMPAIGN_STATUSES,
  isPostalAddressMissing,
  postalHoldFrom,
  type PostalHoldState,
} from "./postal-hold-policy";

/**
 * Sends are held when the sender's workspace has no postal address: the
 * scheduler stops enqueueing ("missing-postal-address") and the processor puts
 * already-queued jobs back with last_error = POSTAL_ADDRESS_HOLD_REASON. Both
 * engine sides read workspace_settings by campaign owner (user id), so so do we.
 *
 * Without a visible notice those campaigns still look "running"/"Live" while
 * nothing goes out.
 */

export * from "./postal-hold-policy";

/**
 * Loads the hold for a user, optionally for one campaign. Never throws: a
 * failed lookup just hides the notice.
 */
export async function getPostalHold(userId: string, opts: { campaignId?: string } = {}): Promise<PostalHoldState> {
  try {
    const db = getDb();
    const [settings] = await db
      .select({ postalAddress: schema.workspaceSettings.postalAddress })
      .from(schema.workspaceSettings)
      .where(eq(schema.workspaceSettings.userId, userId))
      .limit(1);
    if (!isPostalAddressMissing(settings?.postalAddress)) return NO_POSTAL_HOLD;

    const campaignScope = and(
      eq(schema.campaigns.userId, userId),
      isNull(schema.campaigns.deletedAt),
      opts.campaignId ? eq(schema.campaigns.id, opts.campaignId) : undefined,
    );
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

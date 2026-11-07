/**
 * The single "can this campaign start (or resume)" check. Used by campaign
 * Start/Resume and the Autopilot Resume, so every path applies the same
 * rules: a lead list, an owner allowed to send, a complete sender identity
 * (company + postal address) and mailboxes the campaign may use.
 */
import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { Db } from "./db";
import { APPROVAL_REQUIRED_ERROR, assertCanSend } from "./approval";
import { campaignIdentityStartError } from "./campaign-start-guard";
import { campaignSendersStartError, type CampaignSenderRef } from "./campaign-sender-policy";
import { isAutopilotCampaign } from "./pool-campaign-guard";
import { loadComplianceIdentity } from "./gtm-launch";

export const CAMPAIGN_NOT_FOUND_ERROR = "Campaign not found";
export const CAMPAIGN_MISSING_LIST_ERROR = "Campaign is missing a lead list";

/** Mailboxes attached to a campaign (including retired ones). */
export async function loadAttachedSenderRefs(db: Db, campaignId: string): Promise<CampaignSenderRef[]> {
  return db
    .select({
      id: schema.senderAccounts.id,
      userId: schema.senderAccounts.userId,
      isSystemPool: schema.senderAccounts.isSystemPool,
      deletedAt: schema.senderAccounts.deletedAt,
    })
    .from(schema.campaignSenders)
    .innerJoin(schema.senderAccounts, eq(schema.senderAccounts.id, schema.campaignSenders.senderId))
    .where(eq(schema.campaignSenders.campaignId, campaignId));
}

/** Why `campaignId` may not start or resume now, or null when it may. */
export async function campaignStartError(
  db: Db,
  input: { campaignId: string; actor: { id: string; isAdmin: boolean } },
): Promise<string | null> {
  const [c] = await db
    .select({
      id: schema.campaigns.id,
      userId: schema.campaigns.userId,
      workspaceId: schema.campaigns.workspaceId,
      leadListId: schema.campaigns.leadListId,
    })
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.id, input.campaignId), isNull(schema.campaigns.deletedAt)))
    .limit(1);
  if (!c) return CAMPAIGN_NOT_FOUND_ERROR;
  if (!c.leadListId) return CAMPAIGN_MISSING_LIST_ERROR;

  // The OWNER sends, so the owner must be approved (also when an admin acts).
  try {
    await assertCanSend(c.userId);
  } catch (e) {
    return e instanceof Error ? e.message : APPROVAL_REQUIRED_ERROR;
  }

  // The identity of the campaign's workspace: the one its footer will carry (#72).
  const identityError = campaignIdentityStartError(await loadComplianceIdentity(db, c.userId, c.workspaceId ?? null));
  if (identityError) return identityError;

  return campaignSendersStartError({
    attached: await loadAttachedSenderRefs(db, c.id),
    ownerId: c.userId,
    actorIsAdmin: input.actor.isAdmin,
    isAutopilotCampaign: await isAutopilotCampaign(db, c.id),
  });
}

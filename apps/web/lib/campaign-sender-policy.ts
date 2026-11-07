/**
 * Who may attach which mailbox to which campaign.
 *
 * Shared system-pool mailboxes belong to the platform. They are attached by the
 * autopilot launcher only. A non-admin user must never put a pool mailbox on a
 * manual campaign (wizard, duplicate, settings edit), otherwise any account can
 * send its own copy to its own list from the shared pool.
 *
 * Pure: callers load the sender rows and pass them in.
 */

export interface CampaignSenderRef {
  id: string;
  userId: string;
  isSystemPool: boolean;
  deletedAt?: string | null;
}

export type SenderRejectReason = "missing" | "not_owned" | "pool";

export interface SenderPartition {
  allowed: string[];
  rejected: { id: string; reason: SenderRejectReason }[];
}

export const POOL_SENDER_NOT_ALLOWED_ERROR =
  "Shared AutoGTM mailboxes only send Autopilot campaigns. Manual campaigns need a mailbox assigned to your account. Contact support to get one.";

export const SENDER_NOT_OWNED_ERROR =
  "One or more selected mailboxes aren't assigned to your account. Refresh the page and pick your mailboxes again.";

/**
 * Split requested sender ids into the ones this actor may attach and the ones it may not.
 *
 * - Admins may attach their own mailboxes and any system-pool mailbox.
 * - Everyone else may attach only their own, non-pool mailboxes, plus pool
 *   mailboxes listed in `keepPoolIds` (pool mailboxes the autopilot launcher
 *   already attached to this same autopilot campaign; never new ones).
 * - Unknown or deleted mailboxes are always rejected.
 */
export function partitionCampaignSenders(opts: {
  senderIds: readonly string[];
  senders: readonly CampaignSenderRef[];
  userId: string;
  isAdmin: boolean;
  keepPoolIds?: ReadonlySet<string>;
}): SenderPartition {
  const byId = new Map(opts.senders.map((s) => [s.id, s]));
  const allowed: string[] = [];
  const rejected: SenderPartition["rejected"] = [];
  const seen = new Set<string>();

  for (const id of opts.senderIds) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    const s = byId.get(id);
    if (!s || s.deletedAt) {
      rejected.push({ id, reason: "missing" });
      continue;
    }
    if (opts.isAdmin) {
      if (s.userId === opts.userId || s.isSystemPool) allowed.push(id);
      else rejected.push({ id, reason: "not_owned" });
      continue;
    }
    if (s.isSystemPool) {
      if (opts.keepPoolIds?.has(id)) allowed.push(id);
      else rejected.push({ id, reason: "pool" });
      continue;
    }
    if (s.userId !== opts.userId) {
      rejected.push({ id, reason: "not_owned" });
      continue;
    }
    allowed.push(id);
  }

  return { allowed, rejected };
}

/** User-facing error for a partition, or null when nothing was rejected. */
export function senderPartitionError(p: SenderPartition): string | null {
  if (p.rejected.length === 0) return null;
  if (p.rejected.some((r) => r.reason === "pool")) return POOL_SENDER_NOT_ALLOWED_ERROR;
  return SENDER_NOT_OWNED_ERROR;
}

/**
 * Start/resume check on the mailboxes already attached to a campaign.
 * A non-admin may only send a manual campaign from mailboxes they own; pool
 * mailboxes are fine only on the autopilot campaign they were attached to.
 */
export function campaignSendersStartError(opts: {
  attached: readonly CampaignSenderRef[];
  ownerId: string;
  actorIsAdmin: boolean;
  isAutopilotCampaign: boolean;
}): string | null {
  if (opts.actorIsAdmin) return null;
  for (const s of opts.attached) {
    if (s.isSystemPool) {
      if (!opts.isAutopilotCampaign) return POOL_SENDER_NOT_ALLOWED_ERROR;
      continue;
    }
    if (s.userId !== opts.ownerId) return SENDER_NOT_OWNED_ERROR;
  }
  return null;
}

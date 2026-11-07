/**
 * The recipient check for replies a person sends by hand (Inbox, test sends).
 *
 * Built on the engine's loadRecipientVerdict, which the agent and the Needs
 * you path use too:
 * - a global opt-out (anyone's unsubscribe, bounce, complaint or erasure) is
 *   never sent to;
 * - an address on your own blocklist needs an explicit "Send anyway",
 *   because answering a direct question can be legitimate.
 *
 * Not a "use server" module: it takes a trusted owner id.
 */
import {
  loadRecipientVerdict,
  recipientBlockMessage,
  type SuppressionVerdict,
} from "@smartreach/email-engine/suppression";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type RecipientBlock = { level: "global" | "own"; message: string };

export const SEND_ANYWAY_CONFIRM_SUFFIX = " Confirm to send anyway.";

export function toRecipientBlock(email: string, verdict: SuppressionVerdict | null): RecipientBlock | null {
  if (!verdict) return null;
  return { level: verdict.level, message: recipientBlockMessage(email, verdict) };
}

/** Block shown in the Inbox for this recipient, or null. Errors propagate. */
export async function loadRecipientBlock(db: Db, ownerId: string, email: string): Promise<RecipientBlock | null> {
  if (!email) return null;
  return toRecipientBlock(email, await loadRecipientVerdict(db, ownerId, email));
}

/**
 * Pure: may a person send this Inbox reply? Global blocks always refuse; own
 * blocks refuse until the person confirmed. Returns the error, or null.
 */
export function manualReplyBlockError(block: RecipientBlock | null, confirmBlocked: boolean): string | null {
  if (!block) return null;
  if (block.level === "global") return block.message;
  return confirmBlocked ? null : block.message + SEND_ANYWAY_CONFIRM_SUFFIX;
}

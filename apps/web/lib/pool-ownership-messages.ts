/** Copy for the shared mailbox pool ownership guards (client-safe: no db imports). */

export function POOL_OWNER_DELETE_BLOCKED(n: number): string {
  return `You own the shared mailbox pool (${n} ${n === 1 ? "mailbox" : "mailboxes"}). Deleting your account would delete them and every customer's sent emails and replies. Ask another admin to open Admin › Mailbox pool and choose “Take over the pool”, then try again.`;
}

export const WORKSPACE_HOLDS_POOL_ERROR =
  "This workspace still holds shared pool mailboxes, so it can't be deleted. Contact support.";

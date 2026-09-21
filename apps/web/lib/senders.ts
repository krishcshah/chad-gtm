/**
 * Sender pause/resume — pure of Next session/revalidate for unit tests.
 */
import { and, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";

const { senderAccounts } = schema;

export type SenderActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** Pause (pause=true) or resume (pause=false) an owned sender (P04). */
export async function toggleSenderForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  senderId: string,
  pause: boolean,
): Promise<SenderActionResult> {
  try {
    const [row] = await db
      .update(senderAccounts)
      .set({ status: pause ? "paused" : "active", updatedAt: nowIso() })
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)))
      .returning({ id: senderAccounts.id });
    if (!row) return { ok: false, error: "Sender not found" };
    return { ok: true, message: pause ? "Sender paused" : "Sender resumed" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

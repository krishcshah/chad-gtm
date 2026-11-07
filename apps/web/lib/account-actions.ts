"use server";

import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { GLOBAL_SUPPRESSION_SOURCES, schema } from "@smartreach/database";
import { and, eq, notInArray } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { recordContactHistory } from "@/lib/contact-guards";
import { POOL_OWNER_DELETE_BLOCKED, countPoolMailboxesOwnedBy } from "@/lib/pool-ownership";

export async function deleteAccountAction(confirmationText: string): Promise<{ ok: boolean; error?: string }> {
  if (confirmationText.trim() !== "DELETE") {
    return { ok: false, error: "Please type DELETE to confirm permanent account deletion." };
  }

  const user = await requireUser();
  const db = getDb();

  // The shared mailbox pool is owned by the admin who imported it: deleting
  // that account would cascade to every pool mailbox and every customer's sent
  // emails and replies. Refuse (and delete nothing) until another admin takes
  // the pool over. If the check fails, delete nothing.
  try {
    const poolMailboxes = await countPoolMailboxesOwnedBy(db, user.id);
    if (poolMailboxes > 0) return { ok: false, error: POOL_OWNER_DELETE_BLOCKED(poolMailboxes) };
  } catch (err: unknown) {
    console.error("[Account Deletion] Could not check shared pool ownership:", err);
    return { ok: false, error: "Your account could not be deleted. Try again." };
  }

  // Before anything is deleted: keep the 90-day re-contact cooldown in the
  // permanent ledger, so other clients still cannot email these prospects.
  // If that fails, delete nothing.
  try {
    await recordContactHistory(db, { userId: user.id });
  } catch (err: unknown) {
    console.error("[Account Deletion] Could not record contact history:", err);
    return { ok: false, error: "Your account could not be deleted. Try again." };
  }

  try {
    console.log(`[Account Deletion] Initiating permanent purge for user: ${user.email} (ID: ${user.id})`);

    // 1. Delete campaigns first to satisfy the RESTRICT foreign key constraint from campaigns -> lead_lists / email_templates
    await db.delete(schema.campaigns).where(eq(schema.campaigns.userId, user.id));

    // 2. Delete email templates
    await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.userId, user.id));

    // 3. Delete lead lists
    await db.delete(schema.leadLists).where(eq(schema.leadLists.userId, user.id));

    // 4. Remove the private blocklist (it only ever applied to this account).
    // Global opt-outs (unsubscribes, bounces, complaints, erasures) are kept:
    // the user delete sets their owner to NULL and they keep blocking every
    // client. Done last, once the campaigns are gone, so a failure earlier
    // never leaves a live account without its blocklist.
    await db
      .delete(schema.suppressions)
      .where(
        and(
          eq(schema.suppressions.userId, user.id),
          notInArray(schema.suppressions.source, [...GLOBAL_SUPPRESSION_SOURCES]),
        ),
      );

    // 5. Delete user record (which cascades accounts, sessions, workspaces, senders, page_views, leads, replies, unibox, etc.)
    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    console.log(`[Account Deletion] Successfully purged all backend data for user: ${user.email}`);

    // 6. Revoke Better Auth session & delete session cookies
    try {
      const hdrs = await headers();
      await auth.api.signOut({ headers: hdrs });
    } catch {
      // Session already deleted by database CASCADE
    }

    try {
      const cookieStore = await cookies();
      cookieStore.delete("better-auth.session_token");
      cookieStore.delete("better-auth.session_data");
    } catch {
      // Non-critical cookie clear
    }

    return { ok: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Account Deletion] Failed to purge user data:", errorMsg);
    return { ok: false, error: errorMsg };
  }
}

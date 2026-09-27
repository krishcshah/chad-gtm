"use server";

import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { schema } from "@smartreach/database";
import { eq } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";

export async function deleteAccountAction(confirmationText: string): Promise<{ ok: boolean; error?: string }> {
  if (confirmationText.trim() !== "DELETE") {
    return { ok: false, error: "Please type DELETE to confirm permanent account deletion." };
  }

  const user = await requireUser();
  const db = getDb();

  try {
    console.log(`[Account Deletion] Initiating permanent purge for user: ${user.email} (ID: ${user.id})`);

    // 1. Delete campaigns first to satisfy the RESTRICT foreign key constraint from campaigns -> lead_lists / email_templates
    await db.delete(schema.campaigns).where(eq(schema.campaigns.userId, user.id));

    // 2. Delete email templates
    await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.userId, user.id));

    // 3. Delete lead lists
    await db.delete(schema.leadLists).where(eq(schema.leadLists.userId, user.id));

    // 4. Delete user record (which cascades accounts, sessions, workspaces, senders, page_views, leads, replies, unibox, etc.)
    await db.delete(schema.users).where(eq(schema.users.id, user.id));

    console.log(`[Account Deletion] Successfully purged all backend data for user: ${user.email}`);

    // 5. Revoke Better Auth session & delete session cookies
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

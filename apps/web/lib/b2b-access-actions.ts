"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "./session";
import { requireAdmin } from "./admin";
import { grantB2BAccess, hasB2BAccess, revokeB2BAccess } from "./b2b-access";

const B2B_UNLOCK_PENDING_MESSAGE =
  "Thanks! Payments are checked by hand. Send your Stripe receipt to support and an admin will unlock the directory for your account.";

/**
 * Called after the $99 checkout. Payment isn't verified automatically (there
 * is no Stripe API check or webhook), so this never grants access by itself:
 * a session id typed by the user proves nothing. An admin grants access from
 * the admin console after checking the payment in Stripe.
 */
export async function unlockB2bAccessAction(_stripeSessionOrReference?: string) {
  try {
    const { user } = await requireWorkspace();
    if (await hasB2BAccess(user)) {
      revalidatePath("/b2b-database");
      return { success: true, message: "Directory access is already unlocked for your account." };
    }
    return { success: false, error: B2B_UNLOCK_PENDING_MESSAGE };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to check database access. Please contact support.",
    };
  }
}

/**
 * Admin server action to manually grant or revoke B2B database access for any user.
 */
export async function adminToggleB2bAccessAction(targetUserId: string, grant: boolean) {
  try {
    const { user } = await requireWorkspace();
    requireAdmin(user);

    if (grant) {
      await grantB2BAccess(targetUserId, { source: "admin_grant" });
    } else {
      await revokeB2BAccess(targetUserId);
    }

    revalidatePath("/admin");
    revalidatePath("/b2b-database");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Admin action failed." };
  }
}

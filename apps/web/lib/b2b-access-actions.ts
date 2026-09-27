"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "./session";
import { requireAdmin } from "./admin";
import { grantB2BAccess, revokeB2BAccess } from "./b2b-access";

/**
 * Server action for a user to claim / verify their $99 Stripe checkout and unlock lifetime access.
 */
export async function unlockB2bAccessAction(stripeSessionOrReference?: string) {
  try {
    const { user } = await requireWorkspace();

    await grantB2BAccess(user.id, {
      stripeSessionId: stripeSessionOrReference || undefined,
      source: "stripe_checkout",
    });

    revalidatePath("/b2b-database");
    revalidatePath("/leads");

    return {
      success: true,
      message: "Congratulations! Lifetime access to the 300K+ B2B Database has been unlocked.",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Failed to unlock database access. Please contact support.",
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

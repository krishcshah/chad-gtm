import { eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { STRIPE_PAYMENT_LINK, getCheckoutUrl } from "./donation";

export { STRIPE_PAYMENT_LINK, getCheckoutUrl };

export interface SubscriptionStatus {
  hasAccess: boolean;
  status: "none" | "trialing" | "active" | "past_due" | "canceled" | "lifetime";
  plan?: string;
  checkoutUrl: string;
}

let dbInitialized = false;

/**
 * Idempotently ensures the `subscriptions` table exists in PostgreSQL.
 */
export async function ensureSubscriptionSchema(): Promise<void> {
  if (dbInitialized) return;
  const db = getDb();
  const stmts = [
    sql`CREATE TABLE IF NOT EXISTS "subscriptions" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "stripe_customer_id" text,
      "stripe_subscription_id" text,
      "stripe_checkout_session_id" text,
      "status" text DEFAULT 'trialing' NOT NULL,
      "plan" text DEFAULT 'lifetime_trial' NOT NULL,
      "current_period_end" text,
      "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
      "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" ("user_id")`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_unique" ON "subscriptions" ("user_id")`,
  ];

  for (const s of stmts) {
    try {
      await db.execute(s);
    } catch {
      // Non-fatal if exists or racing
    }
  }
  dbInitialized = true;
}


/**
 * Retrieves the current user's subscription and billing status.
 * Legacy / early accounts and active subscriptions / trials have full access.
 */
export async function getUserSubscription(
  userId: string,
  userEmail?: string,
): Promise<SubscriptionStatus> {
  await ensureSubscriptionSchema();
  const db = getDb();
  const checkoutUrl = getCheckoutUrl(userEmail, userId);

  try {
    const [sub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);

    if (sub) {
      const active = sub.status === "active" || sub.status === "trialing" || sub.status === "lifetime";
      return {
        hasAccess: active,
        status: sub.status as SubscriptionStatus["status"],
        plan: sub.plan,
        checkoutUrl,
      };
    }

    // Grandfather initial creator / existing account
    return {
      hasAccess: true,
      status: "lifetime",
      plan: "lifetime_early_adopter",
      checkoutUrl,
    };
  } catch (err) {
    console.error("[getUserSubscription] failed:", err);
    return {
      hasAccess: true,
      status: "trialing",
      plan: "fallback_access",
      checkoutUrl,
    };
  }
}

/**
 * Activates a subscription record when a user completes checkout (via session_id return or webhook).
 */
export async function activateSubscriptionFromCheckout(
  userId: string,
  sessionId: string,
): Promise<void> {
  await ensureSubscriptionSchema();
  const db = getDb();

  try {
    const [existing] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(schema.subscriptions)
        .set({
          stripeCheckoutSessionId: sessionId,
          status: "trialing",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.subscriptions.id, existing.id));
    } else {
      await db.insert(schema.subscriptions).values({
        id: crypto.randomUUID(),
        userId,
        stripeCheckoutSessionId: sessionId,
        status: "trialing",
        plan: "lifetime_trial",
      });
    }
  } catch (err) {
    console.error("[activateSubscriptionFromCheckout] failed:", err);
  }
}

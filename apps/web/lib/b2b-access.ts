import { and, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { isAdminEmail } from "./admin";

/**
 * Base Stripe Payment Link for $99 lifetime B2B database access
 * Uses the live custom payment link from Stripe account acct_1QXsSpRxeTlyT7jA
 * with prefilled_amount=9900 ($99.00 USD)
 */
export const STRIPE_B2B_CHECKOUT_BASE = "https://donate.stripe.com/aFafZjgJy2y5azOgPY6wE0q";

export function getB2BCheckoutUrl(email?: string, userId?: string): string {
  try {
    const url = new URL(STRIPE_B2B_CHECKOUT_BASE);
    url.searchParams.set("prefilled_amount", "9900"); // $99.00
    if (email) url.searchParams.set("prefilled_email", email);
    if (userId) url.searchParams.set("client_reference_id", userId);
    return url.toString();
  } catch {
    return `${STRIPE_B2B_CHECKOUT_BASE}?prefilled_amount=9900`;
  }
}

let schemaEnsured = false;

/**
 * Idempotently ensures the `b2b_database_access` table exists in PostgreSQL.
 */
export async function ensureB2BAccessSchema(): Promise<void> {
  if (schemaEnsured) return;
  const db = getDb();
  const stmts = [
    sql`CREATE TABLE IF NOT EXISTS "b2b_database_access" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "stripe_session_id" text,
      "amount_cents" integer DEFAULT 9900 NOT NULL,
      "status" text DEFAULT 'active' NOT NULL,
      "source" text DEFAULT 'stripe_checkout' NOT NULL,
      "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
      "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
    )`,
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "b2b_database_access_user_idx" ON "b2b_database_access" ("user_id")`,
    sql`CREATE INDEX IF NOT EXISTS "b2b_database_access_status_idx" ON "b2b_database_access" ("status")`,
  ];

  for (const s of stmts) {
    try {
      await db.execute(s);
    } catch {
      // Non-fatal if exists or racing
    }
  }
  schemaEnsured = true;
}

/**
 * Checks if a user has access to the 300K+ B2B leads database.
 * CRITICAL RULE: Admin accounts (e.g. de.krish.shah@gmail.com) are NEVER blocked.
 */
export async function hasB2BAccess(userId: string, email?: string): Promise<boolean> {
  // 1. Admin ALWAYS has unrestricted database access
  if (isAdminEmail(email)) {
    return true;
  }

  // 2. Official demo account for showcase stability
  if (email && email.trim().toLowerCase() === "demo@ratecompany.com") {
    return true;
  }

  try {
    await ensureB2BAccessSchema();
    const db = getDb();
    const [row] = await db
      .select({ id: schema.b2bDatabaseAccess.id, status: schema.b2bDatabaseAccess.status })
      .from(schema.b2bDatabaseAccess)
      .where(
        and(
          eq(schema.b2bDatabaseAccess.userId, userId),
          eq(schema.b2bDatabaseAccess.status, "active")
        )
      )
      .limit(1);

    return !!row;
  } catch (err) {
    console.error("[hasB2BAccess] query error:", err);
    return false;
  }
}

/**
 * Grants permanent lifetime access to the B2B database for a user.
 */
export async function grantB2BAccess(
  userId: string,
  opts?: { stripeSessionId?: string; source?: string }
): Promise<void> {
  await ensureB2BAccessSchema();
  const db = getDb();

  const [existing] = await db
    .select({ id: schema.b2bDatabaseAccess.id })
    .from(schema.b2bDatabaseAccess)
    .where(eq(schema.b2bDatabaseAccess.userId, userId))
    .limit(1);

  const now = new Date().toISOString();

  if (existing) {
    await db
      .update(schema.b2bDatabaseAccess)
      .set({
        status: "active",
        stripeSessionId: opts?.stripeSessionId ?? null,
        source: opts?.source ?? "stripe_checkout",
        updatedAt: now,
      })
      .where(eq(schema.b2bDatabaseAccess.id, existing.id));
  } else {
    await db.insert(schema.b2bDatabaseAccess).values({
      id: crypto.randomUUID(),
      userId,
      stripeSessionId: opts?.stripeSessionId ?? null,
      amountCents: 9900,
      status: "active",
      source: opts?.source ?? "stripe_checkout",
      createdAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Revokes B2B database access for a user.
 */
export async function revokeB2BAccess(userId: string): Promise<void> {
  await ensureB2BAccessSchema();
  const db = getDb();

  await db
    .update(schema.b2bDatabaseAccess)
    .set({
      status: "revoked",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.b2bDatabaseAccess.userId, userId));
}

/**
 * Returns a map of userId -> boolean indicating whether each user has active B2B access.
 * Used by the Admin Console directory.
 */
export async function getAllB2bAccessMap(): Promise<Record<string, boolean>> {
  try {
    await ensureB2BAccessSchema();
    const db = getDb();
    const rows = await db
      .select({
        userId: schema.b2bDatabaseAccess.userId,
        status: schema.b2bDatabaseAccess.status,
      })
      .from(schema.b2bDatabaseAccess);

    const map: Record<string, boolean> = {};
    for (const r of rows) {
      if (r.status === "active") {
        map[r.userId] = true;
      }
    }
    return map;
  } catch (err) {
    console.error("[getAllB2bAccessMap] error:", err);
    return {};
  }
}

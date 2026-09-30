"use server";

import { eq, and } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { getDb } from "./db";
import { ADMIN_EMAIL, isAdminEmail } from "./admin";

export async function claimAdminAccountAction(input: {
  email: string;
  name?: string;
  password: string;
}): Promise<{ ok: boolean; claimed?: boolean; error?: string }> {
  try {
    const cleanEmail = input.email?.trim().toLowerCase();
    if (!isAdminEmail(cleanEmail)) {
      return { ok: false, error: "Only the designated administrator email can claim this account." };
    }

    if (!input.password || input.password.length < 8) {
      return { ok: false, error: "Password must be at least 8 characters long." };
    }

    const db = getDb();
    const existingUsers = await db
      .select({ id: schema.users.id, email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.email, cleanEmail))
      .limit(1);

    if (existingUsers.length === 0) {
      return { ok: false, error: "Admin user not initialized yet." };
    }

    const user = existingUsers[0];

    const existingAccounts = await db
      .select({ id: schema.accounts.id, password: schema.accounts.password })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, user.id), eq(schema.accounts.providerId, "credential")))
      .limit(1);

    if (existingAccounts.length === 0) {
      const newHash = await hashPassword(input.password);
      await db.insert(schema.accounts).values({
        id: crypto.randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: newHash,
      });
      return { ok: true, claimed: true };
    }

    const account = existingAccounts[0];
    const currentHash = account.password;

    let isInitialDefault = false;
    if (currentHash) {
      isInitialDefault =
        (await verifyPassword({ hash: currentHash, password: "4eA2P6SGzLHwUUU" })) ||
        (await verifyPassword({ hash: currentHash, password: "demo123" }));
    }

    if (!isInitialDefault && currentHash) {
      return {
        ok: false,
        error: "This administrator account is already set up. Please sign in with your password.",
      };
    }

    const newHash = await hashPassword(input.password);
    await db
      .update(schema.accounts)
      .set({ password: newHash })
      .where(eq(schema.accounts.id, account.id));

    if (input.name) {
      await db
        .update(schema.users)
        .set({ name: input.name })
        .where(eq(schema.users.id, user.id));
    }

    return { ok: true, claimed: true };
  } catch (err: any) {
    console.error("[claimAdminAccountAction] Error:", err);
    return { ok: false, error: err?.message || "Failed to claim admin account." };
  }
}

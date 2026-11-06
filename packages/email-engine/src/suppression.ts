/**
 * Suppression lookups for the send path.
 *
 * Unsubscribes, hard bounces and complaints are global (they follow the
 * person across every client, because every client sends from the same pool
 * mailboxes). Manual and imported suppressions only apply to the user who
 * added them. The filtering rule lives in @smartreach/database/compliance
 * (`applicableSuppressionValues`) so it is unit-tested once.
 */
import {
  applicableSuppressionValues,
  isGlobalSuppressionSource,
  matchesSuppression,
  normalizeEmail,
  schema,
  suppressionCandidates,
} from "@smartreach/database";
import { inArray, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";

/** Suppression values (emails and "@domain"s) that apply to these recipients for `userId`. */
export async function loadApplicableSuppressions(
  db: EngineDb,
  userId: string,
  emails: string[],
): Promise<string[]> {
  const candidates = [...new Set(emails.filter(Boolean).flatMap(suppressionCandidates))];
  if (candidates.length === 0) return [];
  const rows: { value: string; userId: string; source: string | null }[] = await db
    .select({
      value: schema.suppressions.value,
      userId: schema.suppressions.userId,
      source: schema.suppressions.source,
    })
    .from(schema.suppressions)
    .where(inArray(sql`lower(${schema.suppressions.value})`, candidates));
  return applicableSuppressionValues(rows, userId);
}

/** Is this recipient suppressed for `userId` (own list or a global opt-out)? */
export async function isSuppressedFor(db: EngineDb, userId: string, email: string): Promise<boolean> {
  const values = await loadApplicableSuppressions(db, userId, [email]);
  return matchesSuppression(email, values);
}

/**
 * Record an opt-out. Global sources (unsubscribe/bounce/complaint) block every
 * user; the row is still owned by `userId` (the lead owner) for auditing.
 */
export async function addSuppression(
  db: EngineDb,
  row: {
    userId: string;
    workspaceId?: string | null;
    email: string;
    source: "manual" | "unsubscribe" | "bounce" | "complaint" | "import";
    reason: string;
  },
): Promise<void> {
  const insert = db.insert(schema.suppressions).values({
    id: crypto.randomUUID(),
    userId: row.userId,
    workspaceId: row.workspaceId ?? null,
    value: normalizeEmail(row.email),
    kind: "email",
    reason: row.reason.slice(0, 500),
    source: row.source,
  });
  if (!isGlobalSuppressionSource(row.source)) {
    await insert.onConflictDoNothing();
    return;
  }
  // A per-user (manual/import) row for the same address is upgraded so the
  // opt-out becomes global; an existing global row is left as is.
  await insert.onConflictDoUpdate({
    target: [schema.suppressions.userId, schema.suppressions.value],
    set: { source: row.source, reason: row.reason.slice(0, 500) },
    setWhere: sql`${schema.suppressions.source} not in ('unsubscribe', 'bounce', 'complaint')`,
  });
}

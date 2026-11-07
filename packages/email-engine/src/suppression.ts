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
  GLOBAL_SUPPRESSION_SOURCES,
  isGlobalSuppressionSource,
  matchesSuppression,
  normalizeEmail,
  schema,
  suppressionCandidates,
  suppressionVerdict,
  type SuppressionVerdict,
} from "@smartreach/database";
import { inArray, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";

export type { SuppressionVerdict };

type CandidateRow = { value: string; userId: string | null; source: string | null };

async function loadCandidateRows(db: EngineDb, emails: string[]): Promise<CandidateRow[]> {
  const candidates = [...new Set(emails.filter(Boolean).flatMap(suppressionCandidates))];
  if (candidates.length === 0) return [];
  return db
    .select({
      value: schema.suppressions.value,
      userId: schema.suppressions.userId,
      source: schema.suppressions.source,
    })
    .from(schema.suppressions)
    .where(inArray(sql`lower(${schema.suppressions.value})`, candidates));
}

/** Suppression values (emails and "@domain"s) that apply to these recipients for `userId`. */
export async function loadApplicableSuppressions(
  db: EngineDb,
  userId: string,
  emails: string[],
): Promise<string[]> {
  const rows = await loadCandidateRows(db, emails);
  return applicableSuppressionValues(rows, userId);
}

/** Is this recipient suppressed for `userId` (own list or a global opt-out)? */
export async function isSuppressedFor(db: EngineDb, userId: string, email: string): Promise<boolean> {
  const values = await loadApplicableSuppressions(db, userId, [email]);
  return matchesSuppression(email, values);
}

/**
 * The one recipient check every reply path uses (agent, Needs you, Inbox,
 * test sends): 'global' for anyone's unsubscribe/bounce/complaint/erasure,
 * 'own' for the user's own blocklist, null when they may send. Errors
 * propagate, so callers fail closed.
 */
export async function loadRecipientVerdict(
  db: EngineDb,
  ownerId: string,
  email: string,
): Promise<SuppressionVerdict | null> {
  const rows = await loadCandidateRows(db, [email]);
  const matching = rows.filter((r) => matchesSuppression(email, [r.value]));
  return suppressionVerdict(matching, ownerId);
}

/** Plain explanation of why `email` can't (or shouldn't) be emailed. */
export function recipientBlockMessage(email: string, verdict: SuppressionVerdict): string {
  if (verdict.level === "own") return `${email} is on your blocklist.`;
  if (verdict.source === "bounce") return `${email} bounced, so this address can't receive email.`;
  return `${email} unsubscribed or asked not to be contacted, so AutoGTM won't email them again.`;
}

/** Thrown before SMTP when the recipient is suppressed: nothing was sent. */
export class RecipientSuppressedError extends Error {
  readonly verdict: SuppressionVerdict;
  constructor(email: string, verdict: SuppressionVerdict) {
    super(recipientBlockMessage(email, verdict));
    this.name = "RecipientSuppressedError";
    this.verdict = verdict;
  }
}

/**
 * Record an opt-out. Global sources (unsubscribe/bounce/complaint/erasure)
 * block every user; the row is still owned by `userId` (the lead owner) for
 * auditing.
 */
export async function addSuppression(
  db: EngineDb,
  row: {
    userId: string;
    workspaceId?: string | null;
    email: string;
    source: "manual" | "unsubscribe" | "bounce" | "complaint" | "import" | "not_interested" | "erasure";
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
  // A per-user (manual/import/not_interested) row for the same address is
  // upgraded so the opt-out becomes global; an existing global row is left as is.
  await insert.onConflictDoUpdate({
    target: [schema.suppressions.userId, schema.suppressions.value],
    set: { source: row.source, reason: row.reason.slice(0, 500) },
    setWhere: sql`${schema.suppressions.source} not in (${sql.join(
      GLOBAL_SUPPRESSION_SOURCES.map((s) => sql`${s}`),
      sql`, `,
    )})`,
  });
}

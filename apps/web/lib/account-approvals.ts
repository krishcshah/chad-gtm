/**
 * Pure helpers for the admin "Pending approval" list (see admin-actions.ts).
 */

import { approvalLaunchView, readApprovalLaunch, type ApprovalLaunchView } from "./approval-copy";

export interface AccountApprovalRow {
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  /** ISO timestamp of sign-up. */
  createdAt: string;
  /** ISO timestamp of approval, null while pending. */
  approvedAt: string | null;
  /** ISO timestamp an admin revoked sending, null if never revoked (or re-approved). */
  revokedAt: string | null;
  /** Website from the user's most recent autopilot run, if they started one. */
  website: string | null;
  /** How approving went for this account's campaign (approved rows only). */
  launch?: ApprovalLaunchView | null;
}

export interface AccountApprovalsPayload {
  pending: AccountApprovalRow[];
  recentlyApproved: AccountApprovalRow[];
  /** Whether an approval email will be sent (system mailer configured). */
  emailOnApprove: boolean;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Latest run URL per user. Rows may arrive in any order. */
export function latestWebsiteByUser(
  runs: Array<{ userId: string; url: string | null; createdAt: string | null }>,
): Map<string, string> {
  const best = new Map<string, { url: string; at: string }>();
  for (const run of runs) {
    const url = String(run.url ?? "").trim();
    if (!url) continue;
    const at = run.createdAt ?? "";
    const current = best.get(run.userId);
    if (!current || at > current.at) best.set(run.userId, { url, at });
  }
  return new Map(Array.from(best, ([userId, v]) => [userId, v.url]));
}

/**
 * Per user, the latest approval launch (calibration_profile.approvalLaunch on
 * a run), as the approvals list shows it. A linked campaign reads as live.
 */
export function latestApprovalLaunchByUser(
  rows: Array<{ id: string; userId: string; campaignId: string | null; record: unknown }>,
): Map<string, ApprovalLaunchView> {
  const best = new Map<string, { at: string; view: ApprovalLaunchView }>();
  for (const row of rows) {
    const record = readApprovalLaunch(row.record);
    const view = approvalLaunchView(record, { id: row.id, campaignId: row.campaignId });
    if (!record || !view) continue;
    const at = `${record.approvedAt}|${record.updatedAt}`;
    const current = best.get(row.userId);
    if (!current || at > current.at) best.set(row.userId, { at, view });
  }
  return new Map(Array.from(best, ([userId, v]) => [userId, v.view]));
}

export function toApprovalRows(
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    emailVerified: boolean | null;
    createdAt: Date | string | null;
    approvedAt: Date | string | null;
    approvalRevokedAt?: Date | string | null;
  }>,
  websites: Map<string, string>,
  launches?: Map<string, ApprovalLaunchView>,
): AccountApprovalRow[] {
  return users.map((u) => ({
    userId: u.id,
    name: u.name ?? "",
    email: u.email,
    emailVerified: Boolean(u.emailVerified),
    createdAt: toIso(u.createdAt) ?? new Date(0).toISOString(),
    approvedAt: toIso(u.approvedAt),
    revokedAt: toIso(u.approvalRevokedAt),
    website: websites.get(u.id) ?? null,
    ...(launches ? { launch: launches.get(u.id) ?? null } : {}),
  }));
}

/** Accepts only plausible user ids (better-auth ids / UUIDs). */
export function isValidUserId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

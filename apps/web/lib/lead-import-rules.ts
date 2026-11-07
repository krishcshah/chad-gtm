/**
 * Which rows of a CSV import or a directory save become leads. Pure rules (no
 * db): the callers load the list's active emails and the addresses that must
 * not be contacted, then ask these helpers row by row.
 *
 * - Deleted leads don't count as duplicates: callers pass only active rows.
 * - Blocked addresses (your blocklist, or anyone's unsubscribe, bounce,
 *   complaint or removal request) are skipped and reported, never imported as
 *   New to be cancelled quietly at send time.
 */
import { normalizeEmail } from "@smartreach/shared";

/** The address shape every import path accepts. */
export const IMPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type ImportEmailVerdict = "invalid" | "duplicate" | "blocked" | "ok";

/**
 * Classify one (already normalized) email. `existing` holds the list's active
 * emails, `seen` the ones accepted earlier in this batch, `blocked` the
 * addresses that must not be contacted. Accepting an email is the caller's
 * job (add it to `seen`).
 */
export function classifyImportEmail(
  email: string,
  sets: { existing: Set<string>; seen: Set<string>; blocked: Set<string> },
): ImportEmailVerdict {
  if (!email || !IMPORT_EMAIL_RE.test(email)) return "invalid";
  if (sets.existing.has(email) || sets.seen.has(email)) return "duplicate";
  if (sets.blocked.has(email)) return "blocked";
  return "ok";
}

/** A row of the B2B directory (SQLite). */
export interface DirectoryLeadRow {
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  company_website?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  industry?: string | null;
  raw_data?: string | null;
  work_email?: string | null;
  personal_email?: string | null;
}

export interface DirectoryLeadValues {
  id: string;
  userId: string;
  workspaceId: string | null;
  listId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  website: string;
  linkedin: string;
  location: string;
  industry: string;
  /** The directory's raw columns (stored as-is, like before). */
  customFields: Record<string, string>;
}

function parseRawData(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Directory rows → lead values for one list. Emails are lowercased; empty or
 * malformed ones, addresses already active on the list, repeats within the
 * batch and suppressed addresses are skipped (counted in `skipped`, except
 * rows with no email at all, which were never people to add).
 */
export function directoryRowsToLeadValues(
  rows: readonly DirectoryLeadRow[],
  opts: {
    userId: string;
    workspaceId: string | null;
    listId: string;
    existing: Set<string>;
    suppressed: Set<string>;
  },
): { values: DirectoryLeadValues[]; skipped: number } {
  const values: DirectoryLeadValues[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of rows) {
    if (!r.email) continue;
    const email = normalizeEmail(String(r.email));
    const verdict = classifyImportEmail(email, { existing: opts.existing, seen, blocked: opts.suppressed });
    if (verdict !== "ok") {
      skipped++;
      continue;
    }
    seen.add(email);
    const customObj = parseRawData(r.raw_data);
    if (r.work_email) customObj.work_email = r.work_email;
    if (r.personal_email) customObj.personal_email = r.personal_email;
    values.push({
      id: crypto.randomUUID(),
      userId: opts.userId,
      workspaceId: opts.workspaceId,
      listId: opts.listId,
      email,
      firstName: r.first_name || "",
      lastName: r.last_name || "",
      company: r.company_name || "",
      jobTitle: r.job_title || "",
      website: r.company_website || "",
      linkedin: r.linkedin_url || "",
      location: r.location || "",
      industry: r.industry || "",
      customFields: customObj,
    });
  }
  return { values, skipped };
}

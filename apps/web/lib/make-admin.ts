/**
 * Pure helpers for scripts/make-admin.ts (grant an existing account the admin
 * role). Kept here so they are unit-tested with the web app.
 */

export const MAKE_ADMIN_USAGE =
  "Usage: DATABASE_URL=... npx tsx scripts/make-admin.ts --email you@company.com [--dry-run]";

export type MakeAdminArgs =
  | { ok: true; email: string; dryRun: boolean; help: false }
  | { ok: true; help: true }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses `--email x`, `--email=x`, `--dry-run`, `--help`. */
export function parseMakeAdminArgs(argv: string[]): MakeAdminArgs {
  let email = "";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { ok: true, help: true };
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--email") {
      email = argv[++i] ?? "";
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else {
      return { ok: false, error: `Unknown argument: ${arg}` };
    }
  }
  email = email.trim().toLowerCase();
  if (!email) return { ok: false, error: "Missing --email." };
  if (!EMAIL_RE.test(email) || email.length > 320) return { ok: false, error: "That doesn't look like an email address." };
  return { ok: true, email, dryRun, help: false };
}

/** Finds the account (case-insensitive) without changing it. LIMIT 2 so a case-duplicate is detected. */
export const FIND_USER_SQL = `SELECT id, role, approved_at FROM users WHERE lower(email) = $1 LIMIT 2`;

/**
 * Grants admin and approves the account to send. Idempotent: an existing
 * approval time is kept.
 */
export const MAKE_ADMIN_SQL = `UPDATE users
SET role = 'admin', approved_at = COALESCE(approved_at, now()), updated_at = now()
WHERE id = $1
RETURNING id`;

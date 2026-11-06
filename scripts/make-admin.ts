/**
 * Grant an existing AutoGTM account the admin role (and approve it to send).
 *
 *   DATABASE_URL=... npx tsx scripts/make-admin.ts --email you@company.com
 *   DATABASE_URL=... npx tsx scripts/make-admin.ts --email you@company.com --dry-run
 *
 * This is the bootstrap path for the first admin, and the only way to make an
 * admin on a deployment without a system mailer (no SYSTEM_SMTP_*): there,
 * emails are never verified, so ADMIN_EMAILS / ADMIN_EMAIL cannot grant admin.
 *
 * - The account must already exist: sign up in the app first.
 * - DATABASE_URL comes from the environment only. It is never printed, and
 *   neither is anything else secret.
 * - Re-running is safe: an existing approval time is kept.
 */
import pg from "pg";
import {
  FIND_USER_SQL,
  MAKE_ADMIN_SQL,
  MAKE_ADMIN_USAGE,
  parseMakeAdminArgs,
} from "../apps/web/lib/make-admin";

async function main(): Promise<number> {
  const args = parseMakeAdminArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(`[make-admin] ${args.error}\n${MAKE_ADMIN_USAGE}`);
    return 2;
  }
  if (args.help) {
    console.log(MAKE_ADMIN_USAGE);
    return 0;
  }

  const url = (process.env.DATABASE_URL ?? "").trim().replace(/^["']|["']$/g, "");
  if (!url) {
    console.error("[make-admin] Refusing to run: set DATABASE_URL in the environment.");
    return 1;
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    const found = await pool.query<{ id: string; role: string; approved_at: Date | null }>(FIND_USER_SQL, [args.email]);
    const user = found.rows[0];
    if (!user) {
      console.error(`[make-admin] No account for ${args.email}. Sign up in the app first, then re-run.`);
      return 1;
    }
    if (found.rows.length > 1) {
      console.error(`[make-admin] More than one account matches ${args.email} (different letter case). Fix that first; nothing changed.`);
      return 1;
    }
    if (user.role === "admin" && user.approved_at) {
      console.log(`[make-admin] ${args.email} is already an admin. Nothing to do.`);
      return 0;
    }
    if (args.dryRun) {
      console.log(`[make-admin] Dry run: would grant admin to ${args.email} (current role: ${user.role}).`);
      return 0;
    }
    const updated = await pool.query(MAKE_ADMIN_SQL, [user.id]);
    if (updated.rowCount !== 1) {
      console.error(`[make-admin] Expected to update 1 account, updated ${updated.rowCount ?? 0}. Nothing else changed.`);
      return 1;
    }
    console.log(`[make-admin] ${args.email} is now an admin and approved to send. Sign in again to open /admin.`);
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // pg errors can echo connection details; print only the class of failure.
    const code = (err as { code?: string })?.code;
    console.error(`[make-admin] Failed${code ? ` (${code})` : ""}. Check DATABASE_URL and that migrations have run.`);
    process.exit(1);
  });

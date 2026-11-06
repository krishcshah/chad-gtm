/**
 * Admin access.
 *
 * A user is an admin when:
 *   - users.role === "admin" (set in the database by hand or by migration), or
 *   - their email is VERIFIED and listed in the ADMIN_EMAILS env (comma list).
 *
 * There are no hard-coded admin addresses: an unverified sign-up using an
 * address from ADMIN_EMAILS never becomes admin.
 *
 * This module is imported by client components (sidebar), so keep it free of
 * server-only imports. On the client ADMIN_EMAILS is not available and only
 * the role check applies.
 */

export type AdminCandidate = {
  email?: string | null;
  role?: string | null;
  emailVerified?: boolean | null;
} | null | undefined;

export function getAdminEmails(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * True if the email is listed in ADMIN_EMAILS. This alone does NOT grant admin
 * rights (the address may be unverified); use isAdmin() for access checks.
 */
export function isAdminEmail(
  email?: string | null,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (!clean) return false;
  return getAdminEmails(env).includes(clean);
}

/** True if the user has the admin role, or a verified email listed in ADMIN_EMAILS. */
export function isAdmin(
  user: AdminCandidate,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.emailVerified === true && isAdminEmail(user.email, env);
}

/** Throws unless the user is an admin. */
export function requireAdmin(user: AdminCandidate): void {
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }
}

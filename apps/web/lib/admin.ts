export const ADMIN_EMAIL = "de.krish.shah@gmail.com";

/**
 * Returns true if the provided email matches the designated admin email.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * Returns true if the user object has the designated admin email.
 */
export function isAdmin(user?: { email?: string | null } | null): boolean {
  return isAdminEmail(user?.email);
}

/**
 * Ensures the user has admin privileges; throws if not.
 */
export function requireAdmin(user?: { email?: string | null } | null): void {
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }
}

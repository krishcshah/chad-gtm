export const DEFAULT_ADMIN_EMAIL = "de.krish.shah@gmail.com";
export const ADMIN_EMAIL = DEFAULT_ADMIN_EMAIL;

export const DEFAULT_ADMIN_EMAILS = [
  "de.krish.shah@gmail.com",
  "krish@leadskingdom.co",
];

export function getAdminEmails(): string[] {
  const configured = [
    ...DEFAULT_ADMIN_EMAILS,
    process.env.ADMIN_EMAIL,
    ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(",") : []),
  ];
  return configured
    .filter((e): e is string => Boolean(e && e.trim()))
    .map((e) => e.trim().toLowerCase());
}

/**
 * Returns true if the provided email matches any designated admin email.
 */
export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

/**
 * Returns true if the user object has the admin role or matches a designated admin email.
 */
export function isAdmin(user?: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return isAdminEmail(user.email);
}

/**
 * Ensures the user has admin privileges; throws if not.
 */
export function requireAdmin(user?: { email?: string | null; role?: string | null } | null): void {
  if (!isAdmin(user)) {
    throw new Error("Unauthorized: Admin privileges required.");
  }
}

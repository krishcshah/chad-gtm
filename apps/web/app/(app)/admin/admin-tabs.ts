/** Admin console sections. The value is what appears in `/admin?tab=…`. */
export const ADMIN_TABS = [
  "approvals",
  "users",
  "mailboxes",
  "directory",
  "support",
  "bugs",
  "requests",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

/** Older links used these names for the same sections. */
const ALIASES: Record<string, AdminTab> = {
  analytics: "users",
  compliance: "requests",
  "data-removal": "requests",
  "bug-reports": "bugs",
  pool: "mailboxes",
};

/** Read `?tab=` into a known section; anything else falls back to approvals. */
export function parseAdminTab(value: string | null | undefined): AdminTab {
  if (!value) return "approvals";
  const v = value.toLowerCase();
  if ((ADMIN_TABS as readonly string[]).includes(v)) return v as AdminTab;
  return ALIASES[v] ?? "approvals";
}

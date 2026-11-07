/** Admin console sections. The value is what appears in `/admin?tab=…`. */
export const ADMIN_TABS = [
  "approvals",
  "users",
  "mailboxes",
  "directory",
  "support",
  "requests",
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

/** Older links used these names for the same sections. */
const ALIASES: Record<string, AdminTab> = {
  analytics: "users",
  compliance: "requests",
  "data-removal": "requests",
  bugs: "support",
  "bug-reports": "support",
  pool: "mailboxes",
};

/** Read `?tab=` into a known section; anything else falls back to approvals. */
export function parseAdminTab(value: string | null | undefined): AdminTab {
  if (!value) return "approvals";
  const v = value.toLowerCase();
  if ((ADMIN_TABS as readonly string[]).includes(v)) return v as AdminTab;
  return ALIASES[v] ?? "approvals";
}

/** Old Bug reports links (`?tab=bugs`) open Support filtered to bug tickets. */
export function adminTabSupportCategory(value: string | null | undefined): "bug_report" | null {
  if (!value) return null;
  const v = value.toLowerCase();
  return v === "bugs" || v === "bug-reports" || v === "bug_report" ? "bug_report" : null;
}

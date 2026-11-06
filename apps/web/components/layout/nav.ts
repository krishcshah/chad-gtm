import {
  Bot,
  Home,
  Inbox,
  LifeBuoy,
  MessageSquareWarning,
  Rocket,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should mark this item active. */
  match?: string[];
  /** Two-key shortcut after "g", e.g. "d" for g d. */
  shortcut?: string;
};

export type NavGroup = { label?: string; items: NavItem[] };

export const primaryNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Overview", icon: Home, match: ["/analytics"], shortcut: "d" },
      { href: "/chad-gtm", label: "Autopilot", icon: Bot, shortcut: "a" },
      { href: "/requests", label: "Needs you", icon: MessageSquareWarning, shortcut: "n" },
      { href: "/unibox", label: "Inbox", icon: Inbox, shortcut: "i" },
      {
        href: "/campaigns",
        label: "Campaigns & leads",
        icon: Rocket,
        match: ["/leads", "/templates", "/b2b-database"],
        shortcut: "c",
      },
    ],
  },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, match: ["/blocklist"], shortcut: "s" },
  { href: "/support", label: "Support", icon: LifeBuoy },
];

export const adminNav: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export function isActive(pathname: string, item: NavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

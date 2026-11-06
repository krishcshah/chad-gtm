import {
  BarChart3,
  Bot,
  FileText,
  Home,
  Inbox,
  LifeBuoy,
  Mail,
  MessageSquareWarning,
  Rocket,
  Settings,
  ShieldCheck,
  Users,
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
      { href: "/dashboard", label: "Overview", icon: Home, shortcut: "d" },
      { href: "/chad-gtm", label: "Autopilot", icon: Bot, shortcut: "a" },
      { href: "/requests", label: "Needs you", icon: MessageSquareWarning, shortcut: "n" },
      { href: "/unibox", label: "Inbox", icon: Inbox, shortcut: "i" },
    ],
  },
  {
    label: "Outreach",
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Rocket, shortcut: "c" },
      { href: "/leads", label: "Leads", icon: Users, match: ["/b2b-database"], shortcut: "l" },
      { href: "/senders", label: "Mailboxes", icon: Mail, shortcut: "m" },
      { href: "/templates", label: "Templates", icon: FileText, shortcut: "t" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, shortcut: "y" },
    ],
  },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, match: ["/blocklist"], shortcut: "s" },
  { href: "/support", label: "Support", icon: LifeBuoy, match: ["/bug-report"] },
];

export const adminNav: NavItem = { href: "/admin", label: "Admin", icon: ShieldCheck };

export function isActive(pathname: string, item: NavItem) {
  const prefixes = [item.href, ...(item.match ?? [])];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

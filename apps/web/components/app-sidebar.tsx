"use client";

import { useState, useEffect } from "react";
import {
  Ban,
  BarChart3,
  Database,
  Inbox,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Mail,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  HandHelping,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { isAdmin } from "@/lib/admin";
import { ChadGtmLogo } from "./chad-gtm-logo";
import { ThemeToggle } from "./theme-toggle";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useSidebar } from "./layout/sidebar-context";
import type { WorkspaceItem } from "@/lib/workspaces";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: string;
  count?: number;
  section?: string;
};

const baseNav: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/chad-gtm", label: "Autopilot", icon: Sparkles, badge: "AI" },
  { href: "/requests", label: "Needs you", icon: HandHelping },
  { href: "/unibox", label: "UniBox", icon: Inbox },
  { href: "/campaigns", label: "Campaigns & Leads", icon: Rocket, section: "Manual" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  user,
  workspaces = [],
  activeWorkspace,
  openRequests = 0,
}: {
  user: { name?: string | null; email?: string | null };
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem;
  /** Open agent escalations waiting on the client. */
  openRequests?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggleCollapsed } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const userInitial = (user.name ?? user.email ?? "U").slice(0, 1).toUpperCase();
  const userIsAdmin = isAdmin(user);

  const navItems: NavItem[] = [
    ...baseNav.map((item) => (item.href === "/requests" ? { ...item, count: openRequests } : item)),
    { href: "/support", label: "Support", icon: LifeBuoy },
    ...(userIsAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, badge: "Root" }] : []),
  ];

  return (
    <>
      {/* Desktop Stripe Architectural Collapsible Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl lg:flex transition-all duration-200 ease-in-out select-none",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo and Brand Header with Collapse Toggle */}
        <div
          onClick={collapsed ? toggleCollapsed : undefined}
          title={collapsed ? "Click to expand sidebar" : undefined}
          className={cn(
            "flex h-16 items-center transition-all duration-200",
            collapsed
              ? "justify-center px-2 cursor-pointer hover:bg-zinc-900/60"
              : "justify-between px-4"
          )}
        >
          {collapsed ? (
            <div className="flex items-center justify-center">
              <ChadGtmLogo compact />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ChadGtmLogo />
            </div>
          )}

          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar (Ctrl+B)"
              title="Collapse sidebar (Ctrl+B)"
              className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors shrink-0"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        {/* Workspace Switcher */}
        {activeWorkspace && (
          <div className={cn("transition-all duration-200", collapsed ? "p-2 flex justify-center" : "px-3 pb-2")}>
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              compact={collapsed}
            />
          </div>
        )}

        {/* Navigation items */}
        <nav className={cn("flex-1 space-y-0.5 overflow-y-auto py-3 transition-all duration-200", collapsed ? "px-1.5" : "px-3")}>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const showCount = (item.count ?? 0) > 0;
            return (
              <div key={item.href}>
                {item.section && !collapsed && (
                  <div className="px-2.5 pt-4 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600">
                    {item.section}
                  </div>
                )}
                <Link
                  href={item.href}
                  title={collapsed ? `${item.label}${showCount ? ` (${item.count})` : ""}` : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center rounded-lg py-2 text-[13px] font-medium tracking-tight transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50",
                    collapsed ? "justify-center px-0 h-10 w-full" : "gap-3 px-2.5",
                    active
                      ? "bg-zinc-800/70 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]"
                      : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-100"
                  )}
                >
                  {active && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-gradient" aria-hidden />
                  )}
                  <item.icon
                    className={cn(
                      "size-4 shrink-0 transition-colors",
                      active ? "text-brand-300" : "text-zinc-500 group-hover:text-zinc-300"
                    )}
                  />

                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {showCount ? (
                        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-black tabular-nums">
                          {item.count}
                        </span>
                      ) : item.badge ? (
                        <span className="ml-auto rounded-md border border-brand-400/25 bg-brand-400/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-brand-300">
                          {item.badge}
                        </span>
                      ) : null}
                    </>
                  )}

                  {collapsed && showCount && (
                    <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-400" />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        {/* User Footer Profile */}
        <div
          className={cn(
            "border-t border-zinc-800/80 flex items-center transition-all duration-200",
            collapsed ? "flex-col gap-2 p-2" : "p-3 gap-2.5"
          )}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => router.push("/settings")}
            title="Open Account Settings"
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer group hover:opacity-90 transition-opacity"
          >
            <div
              title={`${user.name ?? "User"} (${user.email})`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-black ring-2 ring-zinc-950 transition-transform group-hover:scale-105"
            >
              {userInitial}
            </div>

            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-semibold text-white leading-tight">
                    {user.name ?? "User"}
                  </p>
                  {userIsAdmin && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-white text-black uppercase tracking-wider">
                      Admin
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-zinc-500 mt-0.5">
                  {user.email}
                </p>
              </div>
            )}
          </div>

          <div className={cn("flex items-center", collapsed ? "flex-col gap-1 mt-1" : "gap-1")}>
            <ThemeToggle />
            <button
              type="button"
              aria-label="Sign out"
              title="Sign out"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
              }}
              className="flex size-7 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>

      </aside>

      {/* Mobile Top Bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-xl px-3.5 lg:hidden">
        <div className="flex items-center gap-2.5 min-w-0">
          <ChadGtmLogo compact />
          {activeWorkspace && (
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              compact
              className="max-w-[130px] sm:max-w-[170px]"
            />
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileOpen}
            className="flex size-9 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-800 transition-colors focus-visible:outline-1 focus-visible:outline-white"
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Slide-Over Backdrop */}
      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-none lg:hidden transition-opacity"
        />
      )}

      {/* Mobile Slide-Over Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-76 sm:w-80 max-w-[85vw] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl lg:hidden transition-transform duration-200 ease-out select-none",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Drawer Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <ChadGtmLogo />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="flex size-8 items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Workspace Switcher in Drawer */}
        {activeWorkspace && (
          <div className="p-3 border-b border-zinc-800 bg-zinc-950">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
            />
          </div>
        )}

        {/* Full Nav Items with labels and badges */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium tracking-tight transition-all duration-150",
                  active
                    ? "bg-zinc-800 text-white font-semibold shadow-xs"
                    : "text-zinc-400 hover:bg-zinc-900/60 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon
                    className={cn(
                      "size-4 shrink-0 transition-transform group-hover:scale-105",
                      active ? "text-white" : "text-zinc-400"
                    )}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {(item.count ?? 0) > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-black">
                    {item.count}
                  </span>
                ) : item.badge ? (
                  <span className="rounded-md border border-brand-400/25 bg-brand-400/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-brand-300">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* User Profile in Drawer */}
        <div className="border-t border-zinc-800 bg-black/90 p-3 space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setMobileOpen(false);
              router.push("/settings");
            }}
            className="flex items-center gap-3 cursor-pointer group hover:opacity-90 transition-opacity"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-white shadow-2xs">
              {userInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-semibold text-white">
                  {user.name ?? "User"}
                </p>
                {userIsAdmin && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-white text-black uppercase tracking-wider">
                    Admin
                  </span>
                )}
              </div>
              <p className="truncate text-[10px] text-zinc-500 mt-0.5">
                {user.email}
              </p>
            </div>
          </div>

          {/* Quick Actions Row */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <span className="text-xs font-medium text-zinc-400">Appearance</span>
            </div>

            <button
              type="button"
              onClick={async () => {
                setMobileOpen(false);
                await authClient.signOut();
                router.push("/");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors"
            >
              <LogOut className="size-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

      </div>
    </>
  );
}

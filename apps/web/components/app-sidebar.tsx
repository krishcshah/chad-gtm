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

const nav = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns & Leads", icon: Rocket },
  { href: "/unibox", label: "Unibox", icon: Inbox, badge: "Live" },
  { href: "/chad-gtm", label: "Autonomous GTM", icon: Sparkles, badge: "AI" },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({
  user,
  workspaces = [],
  activeWorkspace,
}: {
  user: { name?: string | null; email?: string | null };
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem;
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

  const navItems = [
    ...nav,
    { href: "/support", label: "Support", icon: LifeBuoy },
    ...(userIsAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck, badge: "Root" }] : []),
  ];

  return (
    <>
      {/* Desktop Stripe Architectural Collapsible Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-zinc-800 bg-black lg:flex transition-all duration-200 ease-in-out select-none",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo and Brand Header with Collapse Toggle */}
        <div
          onClick={collapsed ? toggleCollapsed : undefined}
          title={collapsed ? "Click to expand sidebar" : undefined}
          className={cn(
            "flex h-16 items-center border-b border-zinc-800 transition-all duration-200",
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
              className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors shrink-0"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        {/* Workspace Switcher */}
        {activeWorkspace && (
          <div className={cn("border-b border-zinc-800 transition-all duration-200", collapsed ? "p-2 flex justify-center" : "p-3")}>
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              compact={collapsed}
            />
          </div>
        )}

        {/* Navigation items */}
        <nav className={cn("flex-1 space-y-1 overflow-y-auto py-3 transition-all duration-200", collapsed ? "px-1.5" : "px-2.5")}>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ""}` : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center rounded-lg py-2 text-xs font-medium tracking-tight transition-all duration-150 outline-none focus-visible:ring-1 focus-visible:ring-white",
                  collapsed ? "justify-center px-0 h-10 w-full" : "gap-3 px-3",
                  active
                    ? "bg-zinc-800/90 text-white font-semibold shadow-xs"
                    : "text-zinc-400 hover:bg-zinc-900/70 hover:text-zinc-100"
                )}
              >
                <item.icon
                  className={cn(
                    "size-4 shrink-0 transition-transform group-hover:scale-105",
                    active ? "text-white" : "text-zinc-400 group-hover:text-zinc-200"
                  )}
                />

                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>

                    {item.badge && (
                      <span
                        className={cn(
                          "ml-auto text-[9px] font-semibold tracking-wider px-2 py-0.5 rounded-full uppercase border",
                          active
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-800 bg-zinc-900/90 text-zinc-400 group-hover:border-zinc-700 group-hover:text-zinc-300"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}

                {/* Collapsed dot badge */}
                {collapsed && item.badge && (
                  <span className="absolute top-2 right-2 size-1.5 rounded-full bg-emerald-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Footer Profile */}
        <div
          className={cn(
            "border-t border-zinc-800 bg-black/90 flex items-center transition-all duration-200",
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
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-xs font-semibold text-white group-hover:border-zinc-500 transition-colors shadow-2xs"
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
              className="flex size-7 items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Autonomous Engine Telemetry & System Status Footer */}
        <div
          className={cn(
            "border-t border-zinc-800 py-2.5 flex items-center text-[10px] select-none transition-all duration-200 bg-zinc-950 font-sans",
            collapsed ? "flex-col gap-1.5 justify-center px-1" : "justify-between px-3"
          )}
        >
          <div className="flex items-center gap-2 text-zinc-400 font-medium">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {!collapsed && <span className="tracking-tight text-[10px]">Chad Core Active</span>}
          </div>

          {!collapsed && (
            <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 tracking-wider">
              5¢ Pool Active
            </span>
          )}
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800 bg-black px-3.5 lg:hidden">
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
            className="flex size-9 items-center justify-center rounded-none bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-800 transition-colors focus-visible:outline-1 focus-visible:outline-white"
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
          "fixed inset-y-0 right-0 z-50 flex w-76 sm:w-80 max-w-[85vw] flex-col border-l border-zinc-800 bg-black shadow-none lg:hidden transition-transform duration-200 ease-out select-none",
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
            className="flex size-8 items-center justify-center rounded-none text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-colors"
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
                {item.badge && (
                  <span
                    className={cn(
                      "text-[9px] font-semibold tracking-wider px-2 py-0.5 rounded-full uppercase border",
                      active
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900 border border-zinc-800 transition-colors"
            >
              <LogOut className="size-3.5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>

        {/* Autonomous Engine Telemetry & System Status Footer */}
        <div className="border-t border-zinc-800 py-2.5 px-3 flex items-center justify-between text-[9px] select-none bg-zinc-950 font-sans text-zinc-400">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-zinc-300">Chad Core Active</span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 tracking-wider">
            5¢ Pool Active
          </span>
        </div>
      </div>
    </>
  );
}

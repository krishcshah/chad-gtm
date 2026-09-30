"use client";

import {
  Ban,
  BarChart3,
  Bug,
  Database,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
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
  { href: "/dashboard", label: "Executive Hub", icon: LayoutDashboard },
  { href: "/chad-gtm", label: "Autonomous GTM", icon: Sparkles, badge: "Core" },
  { href: "/b2b-database", label: "Apollo Directory", icon: Database, badge: "329k" },
  { href: "/campaigns", label: "Outbound Runs", icon: Rocket },
  { href: "/unibox", label: "Live Replies", icon: Inbox, badge: "AI Sync" },
  { href: "/senders", label: "Mailbox Pool", icon: Mail, badge: "3¢ Pool" },
  { href: "/leads", label: "Prospects", icon: Users },
  { href: "/templates", label: "Email Angles", icon: Layers },
  { href: "/settings", label: "Intelligence & Settings", icon: Settings },
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

  const userInitial = (user.name ?? user.email ?? "U").slice(0, 1).toUpperCase();
  const userIsAdmin = isAdmin(user);

  const navItems = [
    ...nav,
    userIsAdmin
      ? { href: "/admin", label: "Admin", icon: ShieldCheck, badge: "Root" }
      : { href: "/bug-report", label: "Bug Report", icon: Bug },
  ];

  return (
    <>
      {/* Desktop Luxury Collapsible Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/50 bg-card/60 backdrop-blur-2xl lg:flex transition-all duration-300 ease-in-out select-none",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo and Brand Header with Collapse Toggle */}
        <div
          onClick={collapsed ? toggleCollapsed : undefined}
          title={collapsed ? "Click to expand sidebar" : undefined}
          className={cn(
            "flex h-16 items-center border-b border-border/40 transition-all duration-300",
            collapsed
              ? "justify-center px-2 cursor-pointer hover:bg-accent/40"
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
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0"
            >
              <PanelLeftClose className="size-4" />
            </button>
          )}
        </div>

        {/* Workspace Switcher */}
        {activeWorkspace && (
          <div className={cn("border-b border-border/40 transition-all duration-300", collapsed ? "p-2 flex justify-center" : "p-3")}>
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              compact={collapsed}
            />
          </div>
        )}

        {/* Navigation items */}
        <nav className={cn("flex-1 space-y-1 overflow-y-auto py-3 transition-all duration-300", collapsed ? "px-2" : "px-3")}>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? `${item.label}${item.badge ? ` (${item.badge})` : ""}` : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center rounded-xl py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  collapsed ? "justify-center px-0 h-10 w-full" : "gap-3 px-3",
                  active
                    ? "bg-primary/10 text-primary font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                {/* Active Indicator Bar on the left */}
                {active && (
                  <span className="absolute left-0 inset-y-1.5 w-1 rounded-r-full bg-primary" />
                )}

                <item.icon
                  className={cn(
                    "size-4 shrink-0 transition-transform group-hover:scale-110",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                />

                {!collapsed && (
                  <>
                    <span className="truncate">{item.label}</span>

                    {item.badge && (
                      <span
                        className={cn(
                          "ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
                          active
                            ? "bg-primary/20 text-primary"
                            : "bg-muted text-muted-foreground group-hover:bg-accent"
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </>
                )}

                {/* Collapsed dot badge */}
                {collapsed && item.badge && (
                  <span className="absolute top-2 right-2.5 size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Footer Profile */}
        <div
          className={cn(
            "border-t border-border/50 bg-card/40 flex items-center transition-all duration-300",
            collapsed ? "flex-col gap-2 p-2" : "p-3.5 gap-3"
          )}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => router.push("/settings")}
            title="Open Account Settings"
            className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group hover:opacity-85 transition-opacity"
          >
            <div
              title={`${user.name ?? "User"} (${user.email})`}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-info/30 text-xs font-bold text-primary shadow-xs border border-primary/20 group-hover:border-primary/50 transition-colors"
            >
              {userInitial}
            </div>

            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-semibold text-foreground leading-tight group-hover:text-primary transition-colors">
                    {user.name ?? "User"}
                  </p>
                  {userIsAdmin && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider">
                      Admin
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground mt-0.5">
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
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>

        {/* Autonomous Engine Telemetry & System Status Footer */}
        <div
          className={cn(
            "border-t border-border/40 py-2.5 flex items-center text-[10px] select-none transition-all duration-300 bg-black/20",
            collapsed ? "flex-col gap-2 justify-center px-1" : "justify-between px-3"
          )}
        >
          <div className="flex items-center gap-1.5 font-mono text-zinc-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {!collapsed && <span>Gemini 3.8 Flash</span>}
          </div>

          {!collapsed && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              3¢ Pool Active
            </span>
          )}
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border/50 bg-card/80 px-3 backdrop-blur-xl lg:hidden">
        <ChadGtmLogo compact />
        {activeWorkspace && (
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeWorkspace={activeWorkspace}
            compact
            className="max-w-[130px]"
          />
        )}
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0",
                pathname.startsWith(item.href)
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              <item.icon className="size-4" />
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}

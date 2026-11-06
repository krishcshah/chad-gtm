"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Settings,
  Sun,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Kbd,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { isAdmin } from "@/lib/admin";
import type { WorkspaceItem } from "@/lib/workspaces";
import { AutoGtmMark } from "./chad-gtm-logo";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { useSidebar } from "./layout/sidebar-context";
import { adminNav, isActive, primaryNav, secondaryNav, type NavItem } from "./layout/nav";
import { openCommandMenu } from "./command-palette";

type SidebarProps = {
  user: { name?: string | null; email?: string | null; role?: string | null; emailVerified?: boolean | null };
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem;
  /** Open agent escalations waiting on the client. */
  openRequests?: number;
};

export function AppSidebar(props: SidebarProps) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Desktop */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-background transition-[width] duration-200 lg:flex",
          collapsed ? "w-[60px]" : "w-60",
        )}
        aria-label="Main navigation"
      >
        <SidebarBody {...props} collapsed={collapsed} />
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-md lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2" aria-label="AutoGTM overview">
          <AutoGtmMark className="size-6" />
          <span className="text-[15px] font-semibold tracking-[-0.03em]">AutoGTM</span>
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openCommandMenu}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Search"
          >
            <Search className="size-[18px]" />
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="ui-overlay absolute inset-0 bg-overlay" data-state="open" onClick={() => setMobileOpen(false)} />
          <div
            className="ui-sheet-left absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-xl"
            data-state="open"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 z-10 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
            <SidebarBody {...props} collapsed={false} mobile />
          </div>
        </div>
      )}
    </TooltipProvider>
  );
}

function SidebarBody({
  user,
  workspaces = [],
  activeWorkspace,
  openRequests = 0,
  collapsed,
  mobile,
}: SidebarProps & { collapsed: boolean; mobile?: boolean }) {
  const pathname = usePathname();
  const { toggleCollapsed } = useSidebar();
  const userIsAdmin = isAdmin(user);
  const counts: Record<string, number> = { "/requests": openRequests };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Brand + workspace */}
      <div className={cn("flex flex-col gap-3 px-3 pt-3", collapsed && "items-center px-2")}>
        <div className={cn("flex h-8 items-center", collapsed ? "justify-center" : "justify-between pl-1.5 pr-0.5")}>
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="AutoGTM overview">
            <AutoGtmMark className="size-6" />
            {!collapsed && <span className="text-[15px] font-semibold tracking-[-0.03em]">AutoGTM</span>}
          </Link>
          {!collapsed && !mobile && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  className="flex size-7 items-center justify-center rounded-md text-subtle-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeft className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                Collapse <span className="opacity-60">⌘B</span>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {activeWorkspace && (
          <WorkspaceSwitcher workspaces={workspaces} activeWorkspace={activeWorkspace} compact={collapsed} />
        )}

        {collapsed ? (
          <NavTooltip label="Search" hint="⌘K">
            <button
              type="button"
              onClick={openCommandMenu}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Search"
            >
              <Search className="size-4" />
            </button>
          </NavTooltip>
        ) : (
          <button
            type="button"
            onClick={openCommandMenu}
            className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] text-subtle-foreground shadow-xs transition-colors hover:border-border-strong hover:text-muted-foreground"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <Kbd>⌘K</Kbd>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("mt-4 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3", collapsed && "items-center px-2")}>
        {primaryNav.map((group, gi) => (
          <div key={gi} className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
            {group.label &&
              (collapsed ? (
                <div className="mx-auto mb-1 h-px w-5 bg-border" aria-hidden />
              ) : (
                <div className="px-2 pb-1 text-xs font-medium text-subtle-foreground">{group.label}</div>
              ))}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item)}
                count={counts[item.href]}
                collapsed={collapsed}
              />
            ))}
          </div>
        ))}

        <div className={cn("mt-auto flex flex-col gap-0.5", collapsed && "items-center")}>
          {secondaryNav.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(pathname, item)} collapsed={collapsed} />
          ))}
          {userIsAdmin && (
            <NavLink item={adminNav} active={isActive(pathname, adminNav)} collapsed={collapsed} />
          )}
        </div>
      </nav>

      {/* Account */}
      <div className={cn("border-t border-border p-2", collapsed && "flex justify-center")}>
        <AccountMenu user={user} isAdmin={userIsAdmin} collapsed={collapsed} />
      </div>
      {collapsed && !mobile && (
        <div className="flex justify-center pb-3">
          <NavTooltip label="Expand sidebar" hint="⌘B">
            <button
              type="button"
              onClick={toggleCollapsed}
              className="flex size-8 items-center justify-center rounded-md text-subtle-foreground hover:bg-muted hover:text-foreground"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="size-4" />
            </button>
          </NavTooltip>
        </div>
      )}
    </div>
  );
}

function NavTooltip({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {hint ? <span className="ml-1.5 opacity-60">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function NavLink({
  item,
  active,
  count,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const showCount = typeof count === "number" && count > 0;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? `${item.label}${showCount ? `, ${count} open` : ""}` : undefined}
      className={cn(
        "group relative flex items-center rounded-md text-[13.5px] font-medium transition-colors",
        collapsed ? "size-9 justify-center" : "h-8 gap-2.5 px-2",
        active
          ? "bg-card text-foreground shadow-xs ring-1 ring-border"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-brand" : "text-subtle-foreground group-hover:text-muted-foreground")}
        aria-hidden
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {showCount &&
        (collapsed ? (
          <span className="absolute right-1 top-1 size-2 rounded-full bg-brand ring-2 ring-background" aria-hidden />
        ) : (
          <span className="tabular ml-auto rounded-full bg-brand px-1.5 py-px text-[11px] font-semibold leading-4 text-brand-foreground">
            {count}
          </span>
        ))}
    </Link>
  );
  return collapsed ? <NavTooltip label={item.label}>{link}</NavTooltip> : link;
}

function AccountMenu({
  user,
  isAdmin: admin,
  collapsed,
}: {
  user: SidebarProps["user"];
  isAdmin: boolean;
  collapsed: boolean;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const name = user.name?.trim() || user.email || "Account";
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center rounded-md text-left outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring",
            collapsed ? "size-9 justify-center" : "w-full gap-2.5 px-2 py-1.5",
          )}
          aria-label="Account menu"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium leading-tight text-foreground">{name}</span>
                {user.email && user.email !== name && (
                  <span className="block truncate text-xs leading-tight text-subtle-foreground">{user.email}</span>
                )}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-subtle-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 pt-1.5">
          <span className="truncate text-[13px] font-medium text-foreground">{name}</span>
          {user.email && <span className="truncate font-normal">{user.email}</span>}
          {admin && <span className="mt-1 text-brand-text">Administrator</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <Settings />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <Sun className="size-4 text-muted-foreground" /> Light
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <Moon className="size-4 text-muted-foreground" /> Dark
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <Monitor className="size-4 text-muted-foreground" /> System
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/");
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


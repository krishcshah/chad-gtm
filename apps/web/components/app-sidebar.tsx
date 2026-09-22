"use client";

import {
  Ban,
  BarChart3,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  Rocket,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/unibox", label: "UniBox", icon: Inbox, badge: "Live" },
  { href: "/campaigns", label: "Campaigns", icon: Rocket },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/senders", label: "Senders", icon: Mail },
  { href: "/templates", label: "Sequences", icon: Layers },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/blocklist", label: "Blocklist", icon: Ban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ user }: { user: { name?: string | null; email?: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <>
      {/* Desktop Luxury Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/50 bg-card/60 backdrop-blur-2xl lg:flex">
        {/* Logo and Brand Header */}
        <div className="flex h-16 items-center px-5 border-b border-border/40">
          <Logo />
        </div>

        {/* Navigation items */}
        <nav className="flex-1 space-y-1 px-3 py-3 overflow-y-auto">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
              </Link>
            );
          })}
        </nav>

        {/* User Footer Profile */}
        <div className="border-t border-border/50 p-3.5 bg-card/40 flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-info/30 text-xs font-bold text-primary shadow-xs border border-primary/20">
            {(user.name ?? user.email ?? "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground leading-tight">
              {user.name ?? "User"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground mt-0.5">
              {user.email}
            </p>
          </div>
          <ThemeToggle />
          <button
            type="button"
            aria-label="Sign out"
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
            }}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border/50 bg-card/80 px-3 backdrop-blur-xl lg:hidden">
        <Logo compact />
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => (
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

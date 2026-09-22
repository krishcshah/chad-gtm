"use client";
import {
  Ban,
  BarChart3,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Rocket,
  Settings,
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
  { href: "/unibox", label: "Unibox", icon: Inbox },
  { href: "/campaigns", label: "Campaigns", icon: Rocket },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/senders", label: "Senders", icon: Mail },
  { href: "/templates", label: "Templates", icon: FileText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/blocklist", label: "Blocklist", icon: Ban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ user }: { user: { name?: string | null; email?: string | null } }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border/60 bg-card/40 backdrop-blur-xl lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo />
        </div>
        <nav className="flex-1 space-y-0.5 px-2.5 py-2">
          {nav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <item.icon className={cn("size-4", active && "text-primary")} />
                {item.label}
                {active && <span className="ml-auto size-1.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border/60 p-3 flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-info/30 text-xs font-semibold text-primary">
            {(user.name ?? user.email ?? "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{user.name ?? "User"}</p>
            <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
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
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-2 border-b border-border/60 bg-card/80 px-3 backdrop-blur-xl lg:hidden">
        <Logo compact />
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={cn(
                "flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pathname.startsWith(item.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"
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

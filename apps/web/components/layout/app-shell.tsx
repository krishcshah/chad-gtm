"use client";

import React from "react";
import { useSidebar } from "./sidebar-context";
import { cn } from "@smartreach/ui";
import { GermanFlag } from "@/components/german-flag";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div
      className={cn(
        "app-shell flex min-h-dvh transition-all duration-300 w-full max-w-full overflow-x-hidden",
        collapsed ? "sidebar-collapsed" : "sidebar-expanded"
      )}
    >
      {children}
    </div>
  );
}

export function AppMainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className={cn(
        "flex-1 min-w-0 w-full max-w-full overflow-x-hidden pt-14 lg:pt-0 flex flex-col group transition-all duration-300 ease-in-out",
        collapsed ? "lg:pl-16" : "lg:pl-64"
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 [&:has(.unibox-root)]:max-w-none [&:has(.unibox-root)]:px-4 [&:has(.unibox-root)]:py-4 sm:[&:has(.unibox-root)]:px-6 lg:[&:has(.unibox-root)]:px-8 [&:has(.apollo-leads-root)]:max-w-none [&:has(.apollo-leads-root)]:px-2 sm:[&:has(.apollo-leads-root)]:px-6 lg:[&:has(.apollo-leads-root)]:px-8 [&:has(.apollo-leads-root)]:py-3 sm:[&:has(.apollo-leads-root)]:py-6 flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
        <div className="flex-1 w-full max-w-full min-w-0 group-has-[.unibox-root]:flex group-has-[.unibox-root]:flex-col group-has-[.unibox-root]:min-h-0 group-has-[.apollo-leads-root]:flex group-has-[.apollo-leads-root]:flex-col">
          {children}
        </div>
        <footer className="mt-auto pt-8 pb-2 text-center text-[10px] text-muted-foreground/40 flex items-center justify-center gap-1.5 select-none group-has-[.unibox-root]:hidden group-has-[.apollo-leads-root]:hidden">
          <GermanFlag className="h-2.5 w-3.5" />
          <span>Made in Germany</span>
        </footer>
      </div>
    </main>
  );
}

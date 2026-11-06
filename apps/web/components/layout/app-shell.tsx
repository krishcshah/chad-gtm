"use client";

import React from "react";
import { cn } from "@smartreach/ui";
import { useSidebar } from "./sidebar-context";

export function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh w-full bg-background">{children}</div>;
}

/** Everything right of the sidebar. Pages set their own width with <Page>. */
export function AppMainContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <main
      id="main"
      className={cn(
        "flex min-w-0 flex-1 flex-col pt-14 transition-[padding] duration-200 lg:pt-0",
        collapsed ? "lg:pl-[60px]" : "lg:pl-60",
      )}
    >
      {children}
    </main>
  );
}

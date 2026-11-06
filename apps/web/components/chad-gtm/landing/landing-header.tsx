"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button, cn } from "@smartreach/ui";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";
import { LANDING_NAV } from "./landing-nav";

/**
 * Sticky marketing header: logo, section anchors, and the account actions.
 * Signed-in visitors get one "Open app" button; everyone else gets
 * "Sign in" and "Get started". Below `md` the anchors move into a menu.
 */
export function LandingHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      // The menu is about to be hidden; keep focus on the control that opened it.
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <AutoGtmLogo />

        <nav aria-label="Sections" className="hidden shrink-0 items-center gap-1 lg:flex">
          {LANDING_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {isLoggedIn ? (
            <Button asChild size="sm">
              <Link href="/chad-gtm">Open app</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild variant="brand" size="sm">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
          <Button
            ref={toggleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      <div
        id={menuId}
        hidden={!open}
        className={cn("border-t border-border bg-background lg:hidden", open && "animate-in")}
      >
        <nav aria-label="Sections" className="mx-auto flex max-w-6xl flex-col px-2 py-2">
          {LANDING_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </a>
          ))}
        </nav>
        {isLoggedIn ? null : (
          <div className="mx-auto flex max-w-6xl items-center border-t border-border px-4 py-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="text-[15px] font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

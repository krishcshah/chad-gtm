"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button, cn } from "@smartreach/ui";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";
import { LANDING_NAV } from "./nav";

/**
 * Sticky header. Transparent over the hero, then a blurred bar once the page
 * scrolls. Below `md` the anchors move into a disclosure menu.
 */
export function LandingHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled || open
          ? "border-border bg-background/75 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-8 px-4 sm:px-6 lg:px-8">
        <AutoGtmLogo />

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {LANDING_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {isLoggedIn ? (
            <Button asChild size="sm" className="rounded-full px-4">
              <Link href="/chad-gtm">
                Open app <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-3 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
              >
                Sign in
              </Link>
              <Button asChild size="sm" className="rounded-full px-4">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
          <Button
            ref={toggleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>

      <div id={menuId} hidden={!open} className="border-t border-border md:hidden">
        <nav aria-label="Sections" className="mx-auto flex max-w-[1200px] flex-col px-2 py-2">
          {LANDING_NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-[15px] text-foreground transition-colors hover:bg-muted"
            >
              {item.label}
            </a>
          ))}
          {!isLoggedIn && (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-3 text-[15px] text-muted-foreground transition-colors hover:bg-muted"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

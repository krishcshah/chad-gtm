"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@smartreach/ui";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";

export function LandingHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <AutoGtmLogo />

        {/* Essential Action CTAs */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isLoggedIn ? (
            <Button
              asChild
              size="sm"
              className="rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 border border-white text-xs gap-1.5 shadow-xs transition-all active:scale-[0.98] whitespace-nowrap"
            >
              <Link href="/chad-gtm">
                Mission Control <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-2 sm:px-3 py-1.5 text-xs font-semibold text-zinc-400 transition-colors hover:text-white hover:bg-zinc-900/60 whitespace-nowrap"
              >
                Sign In
              </Link>
              <Button
                asChild
                size="sm"
                className="rounded-lg bg-white text-black font-semibold hover:bg-zinc-200 border border-white text-xs gap-1.5 shadow-xs transition-all active:scale-[0.98] whitespace-nowrap px-3 sm:px-4"
              >
                <Link href="/signup">
                  Launch Free <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X, Sparkles, Database, Scale, DollarSign, HelpCircle, LogIn, Rocket } from "lucide-react";
import { Button, cn } from "@smartreach/ui";
import { ChadGtmLogo } from "@/components/chad-gtm-logo";

export function LandingHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#07090e]/85 backdrop-blur-2xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <ChadGtmLogo />

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-zinc-400">
          <a href="#how-it-works" className="transition-colors hover:text-white">
            How It Works
          </a>
          <a href="#leads" className="transition-colors hover:text-white">
            329k Leads
          </a>
          <a href="#comparison" className="transition-colors hover:text-white">
            Comparison
          </a>
          <a href="#pricing" className="transition-colors hover:text-white flex items-center gap-1">
            Pricing <span className="text-emerald-400 font-bold">($0/mo)</span>
          </a>
          <a href="#faq" className="transition-colors hover:text-white">
            FAQ
          </a>
        </nav>

        {/* Desktop CTA Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          {isLoggedIn ? (
            <Button
              asChild
              size="sm"
              className="rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 gap-1.5"
            >
              <Link href="/chad-gtm">
                Open Mission Control <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white hover:bg-white/5"
              >
                Sign in
              </Link>
              <Button
                asChild
                size="sm"
                className="rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 hover:opacity-95 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 gap-1.5"
              >
                <Link href="/signup">
                  Launch Free ($0/mo) <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex sm:hidden items-center gap-2">
          {isLoggedIn ? (
            <Button
              asChild
              size="sm"
              className="h-8 px-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-[11px] gap-1"
            >
              <Link href="/chad-gtm">
                App <ArrowRight className="size-3" />
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="h-8 px-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-semibold text-[11px] gap-1"
            >
              <Link href="/signup">
                $0/mo <ArrowRight className="size-3" />
              </Link>
            </Button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="flex size-9 items-center justify-center rounded-xl bg-white/5 text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
          >
            {mobileMenuOpen ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
          </button>
        </div>
      </div>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          role="presentation"
          onClick={closeMenu}
          className="fixed inset-0 top-16 z-40 bg-black/80 backdrop-blur-md sm:hidden transition-opacity"
        />
      )}

      {/* Mobile Slide-Down Drawer */}
      <div
        className={cn(
          "fixed inset-x-0 top-16 z-50 flex flex-col border-b border-white/10 bg-[#07090e]/95 p-5 shadow-2xl backdrop-blur-2xl sm:hidden transition-all duration-300 ease-out",
          mobileMenuOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-4 pointer-events-none"
        )}
      >
        <nav className="flex flex-col space-y-1 pb-4 border-b border-white/10">
          <a
            href="#how-it-works"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Sparkles className="size-4 text-violet-400" />
            <span>How It Works</span>
          </a>
          <a
            href="#leads"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Database className="size-4 text-emerald-400" />
            <span>329k Leads Directory</span>
          </a>
          <a
            href="#comparison"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Scale className="size-4 text-cyan-400" />
            <span>Competitive Matrix</span>
          </a>
          <a
            href="#pricing"
            onClick={closeMenu}
            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <DollarSign className="size-4 text-amber-400" />
              <span>Pricing</span>
            </div>
            <span className="text-xs font-bold text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
              $0/mo + 3¢
            </span>
          </a>
          <a
            href="#faq"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            <HelpCircle className="size-4 text-zinc-400" />
            <span>FAQ</span>
          </a>
        </nav>

        {/* Mobile Action Buttons */}
        <div className="pt-4 space-y-2.5">
          {isLoggedIn ? (
            <Button
              asChild
              className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 gap-2"
            >
              <Link href="/chad-gtm" onClick={closeMenu}>
                <Rocket className="size-4 text-cyan-200" />
                Open Mission Control
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="w-full h-11 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 gap-2"
              >
                <Link href="/signup" onClick={closeMenu}>
                  <Sparkles className="size-4 text-cyan-200" />
                  Launch Free ($0/mo + 3¢/email)
                </Link>
              </Button>
              <Link
                href="/login"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 w-full py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
              >
                <LogIn className="size-3.5" />
                <span>Already have an account? Sign in</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

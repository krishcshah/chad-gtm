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
    <header className="sticky top-0 z-50 w-full border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <ChadGtmLogo />

        {/* Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-zinc-400">
          <a href="#scanner" className="transition-colors hover:text-white">
            Sandbox
          </a>
          <a href="#sequence" className="transition-colors hover:text-white flex items-center gap-1.5">
            3-Touch Cadence <span className="rounded-full border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 px-1.5 py-0.2 text-[9px] font-semibold">New</span>
          </a>
          <a href="#leads" className="transition-colors hover:text-white">
            100M+ Leads
          </a>
          <a href="#roi-calculator" className="transition-colors hover:text-white">
            ROI Calculator
          </a>
          <a href="#comparison" className="transition-colors hover:text-white">
            Why ChadGTM
          </a>
          <a href="#pricing" className="transition-colors hover:text-white flex items-center gap-1.5">
            Pricing <span className="text-white font-medium rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px]">$0/mo + 5¢</span>
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
              className="rounded-lg bg-white text-black font-medium hover:bg-zinc-200 border border-white text-xs gap-1.5 shadow-xs"
            >
              <Link href="/chad-gtm">
                Mission Control <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:text-white hover:bg-zinc-900/60"
              >
                Sign In
              </Link>
              <Button
                asChild
                size="sm"
                className="rounded-lg bg-white text-black font-medium hover:bg-zinc-200 border border-white text-xs gap-1.5 shadow-xs"
              >
                <Link href="/signup">
                  Launch Free <ArrowRight className="size-3.5" />
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
              className="h-8 px-2.5 rounded-lg bg-white text-black font-medium text-[11px] gap-1"
            >
              <Link href="/chad-gtm">
                App <ArrowRight className="size-3" />
              </Link>
            </Button>
          ) : (
            <Button
              asChild
              size="sm"
              className="h-8 px-2.5 rounded-lg bg-white text-black font-medium text-[11px] gap-1"
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
            className="flex size-9 items-center justify-center rounded-lg bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800 transition-colors"
          >
            {mobileMenuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          role="presentation"
          onClick={closeMenu}
          className="fixed inset-0 top-16 z-40 bg-black/85 backdrop-blur-none sm:hidden transition-opacity"
        />
      )}

      {/* Mobile Slide-Down Drawer */}
      <div
        className={cn(
          "fixed inset-x-0 top-16 z-50 flex flex-col border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-2xl p-5 shadow-2xl sm:hidden transition-all duration-200 ease-out font-sans",
          mobileMenuOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-2 pointer-events-none"
        )}
      >
        <nav className="flex flex-col space-y-1 pb-4 border-b border-zinc-800/80">
          <a
            href="#scanner"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <Sparkles className="size-4 text-zinc-400" />
            <span>Live URL Scanner</span>
          </a>
          <a
            href="#architecture"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <Rocket className="size-4 text-zinc-400" />
            <span>Architecture & Blueprint</span>
          </a>
          <a
            href="#leads"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <Database className="size-4 text-zinc-400" />
            <span>100M+ Leads Directory</span>
          </a>
          <a
            href="#comparison"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <Scale className="size-4 text-zinc-400" />
            <span>Matrix vs Competitors</span>
          </a>
          <a
            href="#roi-calculator"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <DollarSign className="size-4 text-zinc-400" />
            <span>ROI & Savings Matrix</span>
          </a>
          <a
            href="#pricing"
            onClick={closeMenu}
            className="flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <div className="flex items-center gap-3">
              <DollarSign className="size-4 text-zinc-400" />
              <span>Pricing</span>
            </div>
            <span className="text-[10px] font-medium text-white bg-zinc-900 px-2 py-0.5 rounded-full border border-zinc-700">
              $0/mo + 5¢
            </span>
          </a>
          <a
            href="#faq"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-900/60 transition-colors"
          >
            <HelpCircle className="size-4 text-zinc-400" />
            <span>FAQ</span>
          </a>
        </nav>

        {/* Mobile Action Buttons */}
        <div className="pt-4 space-y-2">
          {isLoggedIn ? (
            <Button
              asChild
              className="w-full h-10 rounded-lg bg-white text-black font-medium text-xs border border-white gap-2 shadow-xs"
            >
              <Link href="/chad-gtm" onClick={closeMenu}>
                <Rocket className="size-4" />
                Open Mission Control
              </Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                className="w-full h-10 rounded-lg bg-white text-black font-medium text-xs border border-white gap-2 shadow-xs"
              >
                <Link href="/signup" onClick={closeMenu}>
                  <Sparkles className="size-4" />
                  Launch Free ($0/mo + 5¢/email)
                </Link>
              </Button>
              <Link
                href="/login"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 w-full py-2 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                <LogIn className="size-3.5" />
                <span>Existing User? Sign In</span>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

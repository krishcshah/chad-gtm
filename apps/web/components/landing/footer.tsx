import Link from "next/link";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";
import { LANDING } from "./content";
import { LANDING_NAV } from "./nav";
import { Container } from "./primitives";

const linkClass = "text-[14px] text-muted-foreground transition-colors hover:text-foreground";

export function LandingFooter({ isLoggedIn }: { isLoggedIn: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <Container className="flex flex-col gap-12 py-16">
        <div className="flex flex-col justify-between gap-12 md:flex-row">
          <div className="flex max-w-xs flex-col gap-4">
            <AutoGtmLogo />
            <p className="text-[14px] leading-relaxed text-muted-foreground">{LANDING.footer.tagline}</p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
            <nav aria-label="Product" className="flex flex-col gap-3">
              <h2 className="text-[13px] font-medium text-foreground">Product</h2>
              {LANDING_NAV.map((item) => (
                <a key={item.href} href={item.href} className={linkClass}>
                  {item.label}
                </a>
              ))}
            </nav>
            <nav aria-label="Account" className="flex flex-col gap-3">
              <h2 className="text-[13px] font-medium text-foreground">Account</h2>
              {isLoggedIn ? (
                <>
                  <Link href="/chad-gtm" className={linkClass}>
                    Open app
                  </Link>
                  <Link href="/support" className={linkClass}>
                    Support
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/signup" className={linkClass}>
                    Get started
                  </Link>
                  <Link href="/login" className={linkClass}>
                    Sign in
                  </Link>
                </>
              )}
            </nav>
            <nav aria-label="Legal" className="flex flex-col gap-3">
              <h2 className="text-[13px] font-medium text-foreground">Legal</h2>
              <Link href="/privacy" className={linkClass}>
                Privacy
              </Link>
              <Link href="/impressum" className={linkClass}>
                Impressum
              </Link>
              <Link href="/remove-my-info" className={linkClass}>
                Remove my info
              </Link>
              <Link href="/unsubscribe" className={linkClass}>
                Unsubscribe
              </Link>
            </nav>
          </div>
        </div>
        <p className="text-xs text-subtle-foreground">© {year} AutoGTM</p>
      </Container>
      {/* Oversized wordmark that bleeds off the bottom edge. */}
      <p
        aria-hidden
        className="lp-text-fade pointer-events-none -mb-[0.22em] select-none text-center text-[22vw] font-semibold leading-none tracking-[-0.07em] opacity-[0.08]"
      >
        AutoGTM
      </p>
    </footer>
  );
}

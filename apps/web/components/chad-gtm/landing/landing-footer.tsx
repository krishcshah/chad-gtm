import Link from "next/link";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LANDING_NAV } from "./landing-nav";
import { Container } from "./section";

const linkClass = "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function LandingFooter({ isLoggedIn }: { isLoggedIn: boolean }) {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background py-12">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col justify-between gap-10 md:flex-row">
          <div className="flex max-w-xs flex-col gap-3">
            <AutoGtmLogo size="sm" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Outbound for founders, from your website to your calendar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <nav aria-label="Product" className="flex flex-col gap-2.5">
              <h2 className="text-[13px] font-medium text-foreground">Product</h2>
              {LANDING_NAV.map((item) => (
                <a key={item.href} href={item.href} className={linkClass}>
                  {item.label}
                </a>
              ))}
            </nav>
            <nav aria-label="Account" className="flex flex-col gap-2.5">
              <h2 className="text-[13px] font-medium text-foreground">Account</h2>
              {isLoggedIn ? (
                <Link href="/chad-gtm" className={linkClass}>
                  Open app
                </Link>
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
            <nav aria-label="Legal" className="flex flex-col gap-2.5">
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
            </nav>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          <p className="text-xs text-subtle-foreground">© {year} AutoGTM</p>
          <ThemeToggle />
        </div>
      </Container>
    </footer>
  );
}

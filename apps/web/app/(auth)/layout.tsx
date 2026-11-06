import Link from "next/link";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-20 shrink-0 items-center justify-center px-4">
        <AutoGtmLogo href="/" />
      </header>
      <main id="main" className="flex flex-1 flex-col items-center px-4 pb-10 pt-2 sm:justify-center sm:pb-20">
        <div className="w-full max-w-[400px]">{children}</div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 pb-6 text-xs text-subtle-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/impressum" className="hover:text-foreground">
          Impressum
        </Link>
      </footer>
    </div>
  );
}

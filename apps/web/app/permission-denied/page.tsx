import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@smartreach/ui";
import { AutoGtmLogo } from "@/components/chad-gtm-logo";

export const metadata = { title: "Access denied" };

/** Shown when a signed-in account is not allowed to open a page. */
export default function PermissionDeniedPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-20 shrink-0 items-center justify-center px-4">
        <AutoGtmLogo href="/" />
      </header>
      <main id="main" className="flex flex-1 flex-col items-center px-4 pb-20 pt-2 sm:justify-center">
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div className="mb-5 flex size-10 items-center justify-center rounded-lg bg-warning-soft text-warning-text">
            <Lock className="size-5" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-foreground">You don&apos;t have access</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This account isn&apos;t allowed to open that page. Go back to your overview, or sign in with an account
            that has access.
          </p>
          <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button asChild>
              <Link href="/dashboard">Go to overview</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Sign in with another account</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

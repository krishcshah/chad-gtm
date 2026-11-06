"use client";

import Link from "next/link";
import { Button, StatePanel } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const denied = /permission|forbidden|unauthorized|access denied/i.test(error.message ?? "");

  return (
    <Page width="narrow">
      <StatePanel
        kind={denied ? "permission" : "error"}
        title={denied ? "You don't have access to this page" : "This page didn't load"}
        description={
          denied
            ? "This account isn't allowed to open it. Go back to your overview, or sign in with an account that has access."
            : "Something went wrong while loading it. Try again; if it keeps happening, go back to your overview."
        }
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {denied ? (
                <>
                  <Button asChild size="sm">
                    <Link href="/dashboard">Go to overview</Link>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={reset}>
                    Try again
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" size="sm" onClick={reset}>
                    Try again
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard">Go to overview</Link>
                  </Button>
                </>
              )}
            </div>
            {error.digest ? (
              <p className="text-xs text-subtle-foreground">
                Reference: <span className="font-mono">{error.digest}</span>
              </p>
            ) : null}
          </div>
        }
      />
    </Page>
  );
}

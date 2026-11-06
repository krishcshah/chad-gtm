import Link from "next/link";
import { Button } from "@smartreach/ui";
import { PublicShell } from "./public-shell";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <PublicShell>
      <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
        <p className="tabular text-sm font-medium text-subtle-foreground">404</p>
        <h1 className="mt-2 text-balance text-2xl font-semibold tracking-[-0.025em] text-foreground sm:text-3xl">
          Page not found
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved. Check the address, or head back.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild>
            <Link href="/">Go to the homepage</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Open AutoGTM</Link>
          </Button>
        </div>
      </div>
    </PublicShell>
  );
}

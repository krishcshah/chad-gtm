"use client";

import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@smartreach/ui";
import { AuthCard, authLinkClass } from "./auth-card";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AuthCard
      icon={AlertCircle}
      tone="destructive"
      title="This page didn't load"
      description="Something went wrong on our side. Try again, or come back in a minute."
      footer={
        <Link href="/" className={authLinkClass}>
          Go to the homepage
        </Link>
      }
    >
      <div className="flex flex-col gap-3">
        <Button type="button" className="h-10 w-full" onClick={reset}>
          Try again
        </Button>
        {error.digest ? (
          <p className="text-center text-xs text-subtle-foreground">
            Reference: <span className="font-mono">{error.digest}</span>
          </p>
        ) : null}
      </div>
    </AuthCard>
  );
}

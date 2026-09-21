"use client";

import { ErrorState } from "@smartreach/ui";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="w-full max-w-sm">
      <ErrorState
        title="Sign-in unavailable"
        description={error.message || "We could not load the sign-in form. Try again."}
        onRetry={reset}
      />
    </div>
  );
}

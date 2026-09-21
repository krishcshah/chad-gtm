"use client";

import { Button, ErrorState } from "@smartreach/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const denied =
    /permission|forbidden|unauthorized|access denied/i.test(error.message ?? "");

  if (denied) {
    return (
      <div className="py-8">
        <ErrorState
          title="Access denied"
          description="You do not have permission to view this page. Sign in with an allowed account, or go back to the dashboard."
          onRetry={reset}
        />
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" asChild>
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <ErrorState
        title="Could not load this page"
        description={error.message || "An unexpected error occurred while rendering this screen."}
        onRetry={reset}
      />
    </div>
  );
}

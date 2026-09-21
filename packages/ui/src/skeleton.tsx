import { cn } from "./utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-lg bg-muted/60", className)} {...props} />;
}

/** Stat-card skeleton used on dashboard & list pages while loading. */
export function StatSkeleton() {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-5 space-y-3">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14" />
    </div>
  );
}

/** Table skeleton with n rows. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/80 p-4 space-y-3">
      <div className="flex gap-3">{Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-3 flex-1" />)}</div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  );
}

/** Campaign wizard / multi-step form loading shell. */
export function WizardSkeleton({ steps = 6 }: { steps?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex items-center gap-2">
        {Array.from({ length: steps }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="hidden h-3 w-12 sm:block" />
            {i < steps - 1 ? <Skeleton className="mx-1 h-px w-6" /> : null}
          </div>
        ))}
      </div>
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="rounded-xl border border-border/70 bg-card/80 p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Analytics / detail metrics loading shell. */
export function AnalyticsSkeleton() {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/70 bg-card/80 p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="rounded-xl border border-border/70 bg-card/80 p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading analytics</span>
    </div>
  );
}

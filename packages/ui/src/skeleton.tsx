import { cn } from "./utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/** Stat tile placeholder. */
export function StatSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

/** Table placeholder with n rows. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" aria-busy="true">
      <div className="flex gap-4 border-b border-border bg-muted/50 px-5 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-border px-5 py-3.5 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Multi-step form placeholder. */
export function WizardSkeleton({ steps = 6 }: { steps?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex items-center gap-3">
        {Array.from({ length: steps }).map((_, i) => (
          <Skeleton key={i} className="h-2 flex-1 rounded-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** KPI row + chart placeholder. */
export function AnalyticsBodySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-56 w-full sm:h-64" />
      </div>
    </div>
  );
}

/** Analytics page placeholder. */
export function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <AnalyticsBodySkeleton />
      <span className="sr-only">Loading analytics</span>
    </div>
  );
}

/** Generic page placeholder: header, stat row, table. Use in loading.tsx files. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}

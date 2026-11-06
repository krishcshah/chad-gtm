import { Skeleton, StatSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function TraceLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="size-7 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-56 max-w-full" />
                <Skeleton className="h-3 w-80 max-w-full" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading trace</span>
      </div>
    </Page>
  );
}

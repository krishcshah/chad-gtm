import { Skeleton, StatSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function MissionControlLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-56 max-w-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
        <span className="sr-only">Loading run</span>
      </div>
    </Page>
  );
}

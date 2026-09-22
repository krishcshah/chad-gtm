import { Skeleton, StatSkeleton } from "@smartreach/ui";

export default function CampaignDetailLoading() {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-9 w-52" />
      <div className="rounded-xl border border-border/70 bg-card/80 p-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-3 h-2 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <div className="rounded-xl border border-border/70 bg-card/80 p-5 space-y-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <span className="sr-only">Loading campaign</span>
    </div>
  );
}

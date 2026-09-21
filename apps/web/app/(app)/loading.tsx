import { Skeleton, StatSkeleton, TableSkeleton } from "@smartreach/ui";

export default function Loading() {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <TableSkeleton rows={5} cols={4} />
      <span className="sr-only">Loading</span>
    </div>
  );
}

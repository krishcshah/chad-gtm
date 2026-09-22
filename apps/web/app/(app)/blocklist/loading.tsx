import { Skeleton, TableSkeleton } from "@smartreach/ui";

export default function BlocklistLoading() {
  return (
    <div className="page-stack" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-full sm:w-44" />
      </div>
      <TableSkeleton rows={6} cols={5} />
      <span className="sr-only">Loading blocklist</span>
    </div>
  );
}

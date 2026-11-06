import { Skeleton, TableSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function BlocklistLoading() {
  return (
    <Page>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" aria-hidden>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-56" />
        </div>
        <TableSkeleton rows={6} cols={4} />
        <span className="sr-only">Loading blocklist</span>
      </div>
    </Page>
  );
}

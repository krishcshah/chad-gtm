import { Skeleton, TableSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function CampaignsLoading() {
  return (
    <Page>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" aria-busy="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Skeleton className="h-9 w-full sm:w-80" />
          <Skeleton className="h-9 w-full sm:w-96" />
        </div>
        <TableSkeleton rows={6} cols={6} />
      </div>
      <span className="sr-only">Loading campaigns</span>
    </Page>
  );
}

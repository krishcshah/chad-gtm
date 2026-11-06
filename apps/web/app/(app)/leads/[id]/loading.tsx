import { Skeleton, TableSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function Loading() {
  return (
    <Page width="wide">
      <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Skeleton className="h-9 w-full sm:w-80" />
            <Skeleton className="h-9 w-full sm:w-44" />
          </div>
          <TableSkeleton rows={8} cols={6} />
        </div>
        <span className="sr-only">Loading leads</span>
      </div>
    </Page>
  );
}

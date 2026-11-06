import { Skeleton, TableSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function Loading() {
  return (
    <Page>
      <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <TableSkeleton rows={5} cols={3} />
        <span className="sr-only">Loading lead lists</span>
      </div>
    </Page>
  );
}

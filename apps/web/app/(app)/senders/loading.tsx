import { Skeleton, TableSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function Loading() {
  return (
    <Page>
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <TableSkeleton rows={4} cols={4} />
      <span className="sr-only">Loading mailboxes</span>
    </Page>
  );
}

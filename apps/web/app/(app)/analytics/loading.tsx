import { Skeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";
import { AnalyticsSectionSkeleton } from "@/components/analytics-section";

export default function Loading() {
  return (
    <Page>
      <div className="flex flex-col gap-2" aria-hidden>
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between" aria-hidden>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-72 max-w-full rounded-lg" />
        </div>
        <AnalyticsSectionSkeleton />
      </div>
    </Page>
  );
}

import { Skeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function Loading() {
  return (
    <Page width="narrow">
      <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <span className="sr-only">Loading</span>
      </div>
    </Page>
  );
}

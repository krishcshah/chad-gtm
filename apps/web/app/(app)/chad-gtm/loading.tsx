import { Skeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function AutopilotLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="ml-auto h-11 w-40" />
        </div>
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-28" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Loading autopilot</span>
      </div>
    </Page>
  );
}

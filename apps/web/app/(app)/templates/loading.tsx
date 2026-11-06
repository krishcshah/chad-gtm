import { Card, Skeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

/** Shaped like the templates library: header, toolbar and a list of rows. */
export default function TemplatesLoading() {
  return (
    <Page>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Skeleton className="h-9 w-full sm:w-80" />
          <Skeleton className="h-9 w-full sm:w-64" />
        </div>
        <Card>
          <div className="flex flex-col gap-2 px-5 pt-5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="mt-3 divide-y divide-border border-t border-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                <Skeleton className="size-8 shrink-0" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-48 max-w-full" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="hidden h-8 w-14 sm:block" />
              </div>
            ))}
          </div>
        </Card>
        <span className="sr-only">Loading templates</span>
      </div>
    </Page>
  );
}

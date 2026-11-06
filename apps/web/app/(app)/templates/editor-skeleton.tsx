import { Card, Skeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

/** Shaped like the email template editor: header, form card and preview card. */
export function EditorSkeleton() {
  return (
    <Page>
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-5">
          <Card className="flex flex-col gap-5 p-5 lg:col-span-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-72 w-full" />
          </Card>
          <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-40 w-full" />
          </Card>
        </div>
        <span className="sr-only">Loading template</span>
      </div>
    </Page>
  );
}

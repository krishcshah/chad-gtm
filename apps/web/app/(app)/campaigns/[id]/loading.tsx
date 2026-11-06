import { Card, Skeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function CampaignDetailLoading() {
  return (
    <Page>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" aria-busy="true">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="mt-1 h-5 w-40" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="size-9" />
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </Card>

      <div className="flex flex-col gap-5">
        <div className="flex gap-5 border-b border-border pb-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card className="flex flex-col gap-4 p-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-56 w-full" />
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </Card>
          </div>
          <div className="flex flex-col gap-6">
            <Card className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-3 w-40" />
            </Card>
            <Card className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </Card>
          </div>
        </div>
      </div>
      <span className="sr-only">Loading campaign</span>
    </Page>
  );
}

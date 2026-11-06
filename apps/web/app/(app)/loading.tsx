import { PageSkeleton } from "@smartreach/ui";
import { Page } from "@/components/layout/page";

export default function Loading() {
  return (
    <Page>
      <PageSkeleton />
      <span className="sr-only" role="status">
        Loading
      </span>
    </Page>
  );
}

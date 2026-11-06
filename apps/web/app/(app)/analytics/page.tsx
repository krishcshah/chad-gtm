import type { Metadata } from "next";
import { PageHeader } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { Page } from "@/components/layout/page";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const sp = searchParams ? await searchParams : {};

  return (
    <Page>
      <PageHeader
        title="Analytics"
        description="How your outreach is doing across every campaign: what was sent, who replied and what bounced."
      />
      <AnalyticsSectionLoader from={sp.from} to={sp.to} />
    </Page>
  );
}

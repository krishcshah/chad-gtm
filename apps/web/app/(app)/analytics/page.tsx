import { PageHeader } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";

export const dynamic = "force-dynamic";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;

  return (
    <div className="page-stack">
      <PageHeader
        title="Analytics"
        description="Leads contacted, replies, and bounces across every campaign. Opens and clicks are not tracked."
      />
      <AnalyticsSectionLoader from={sp.from} to={sp.to} />
    </div>
  );
}

import { PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { AnalyticsSectionLoader } from "@/components/analytics-section-loader";
import { getActiveCampaigns, listSenders } from "@/lib/queries";
import { PerformanceBreakdown } from "../dashboard/performance-breakdown";

export const dynamic = "force-dynamic";

export const metadata = { title: "Analytics · SmartReach" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const [activeCampaigns, senders] = await Promise.all([
    getActiveCampaigns(user.id, workspace.id),
    listSenders(user.id, workspace.id),
  ]);

  return (
    <div className="page-stack space-y-6">
      <PageHeader
        title="Analytics"
        description="Comprehensive deliverability, response tracking, and mailbox performance across all campaigns."
      />
      <AnalyticsSectionLoader from={sp.from} to={sp.to} />
      <PerformanceBreakdown
        campaigns={activeCampaigns}
        senders={senders.map((s) => ({
          id: s.id,
          senderName: s.senderName,
          email: s.email,
          status: s.status,
          health: s.health,
          dailyLimit: s.dailyLimit,
          hourlyLimit: s.hourlyLimit,
          usedToday: s.usedToday,
          repliedCount: s.repliedCount,
        }))}
      />
    </div>
  );
}

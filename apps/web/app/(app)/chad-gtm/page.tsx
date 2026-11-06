import { desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { requireUser } from "@/lib/session";
import { getDb, ensureChadGtmTables } from "@/lib/db";
import { getDirectoryFacets } from "@/lib/leads-directory";
import { loadLaunchContext, runLaunchState } from "@/lib/autopilot-state";
import { Page } from "@/components/layout/page";
import { ChadGtmWizard } from "./chad-gtm-wizard";
import { AutopilotLauncher, type RunSummary } from "./autopilot-launcher";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Autopilot",
  description: "Paste your website. AutoGTM finds buyers, sends the emails, answers replies and books meetings.",
};

export default async function ChadGtmPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser();
  const { mode } = await searchParams;

  if (mode === "guided") {
    const facets = getDirectoryFacets();
    return (
      <Page width="narrow">
        <ChadGtmWizard allIndustries={facets.industries.map((i) => i.value)} />
      </Page>
    );
  }

  const db = getDb();
  await ensureChadGtmTables(db);
  const rows = await db
    .select({
      id: schema.chadGtmRuns.id,
      companyName: schema.chadGtmRuns.companyName,
      url: schema.chadGtmRuns.url,
      status: schema.chadGtmRuns.status,
      campaignId: schema.chadGtmRuns.campaignId,
      bookingUrl: schema.chadGtmRuns.bookingUrl,
      autopilot: schema.chadGtmRuns.autopilot,
      replyAgentMode: schema.chadGtmRuns.replyAgentMode,
      dailyEmailLimit: schema.chadGtmRuns.dailyEmailLimit,
      createdAt: schema.chadGtmRuns.createdAt,
      icpProfile: schema.chadGtmRuns.icpProfile,
      calibrationProfile: schema.chadGtmRuns.calibrationProfile,
    })
    .from(schema.chadGtmRuns)
    .where(eq(schema.chadGtmRuns.userId, user.id))
    .orderBy(desc(schema.chadGtmRuns.createdAt))
    .limit(30);

  // One phase per run so a run without a campaign never shows as "Live".
  const ctx = await loadLaunchContext(db, user.id);
  const runs: RunSummary[] = rows.map(({ icpProfile, calibrationProfile, ...r }: any) => ({
    ...r,
    phase: runLaunchState({ ...r, icpProfile, calibrationProfile } as any, ctx).phase,
  }));

  return <AutopilotLauncher runs={runs} />;
}

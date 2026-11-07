import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { requireWorkspace } from "@/lib/session";
import { wsCondition } from "@/lib/queries";
import { getDb, ensureChadGtmTables } from "@/lib/db";
import { getDirectoryFacets } from "@/lib/leads-directory";
import { loadLaunchContext, runLaunchState } from "@/lib/autopilot-state";
import { Page } from "@/components/layout/page";
import { guidedResumeStep } from "@/lib/autopilot-policy";
import { ChadGtmWizard, type WizardResume } from "./chad-gtm-wizard";
import { AutopilotLauncher, type RunSummary } from "./autopilot-launcher";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Autopilot",
  description: "Paste your website. AutoGTM finds buyers, sends the emails, answers replies and shares your booking link.",
};

export default async function ChadGtmPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; run?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const { mode, run: resumeRunId } = await searchParams;

  if (mode === "guided") {
    const facets = getDirectoryFacets();
    let resume: WizardResume | undefined;
    if (resumeRunId) {
      // Continue an unfinished draft where it stopped (#55): the owner's, never launched or deleted.
      const db = getDb();
      await ensureChadGtmTables(db);
      const [draft] = await db
        .select()
        .from(schema.chadGtmRuns)
        .where(
          and(
            eq(schema.chadGtmRuns.id, resumeRunId),
            eq(schema.chadGtmRuns.userId, user.id),
            isNull(schema.chadGtmRuns.campaignId),
            isNull(schema.chadGtmRuns.dismissedAt),
          ),
        )
        .limit(1);
      if (!draft) notFound();
      resume = {
        runId: draft.id,
        url: draft.url ?? "",
        notes: "",
        strategy: {
          companyName: draft.companyName ?? "",
          businessOverview: (draft.businessOverview as any) ?? {},
          icpProfile: (draft.icpProfile as any) ?? {},
          offers: Array.isArray(draft.offers) ? (draft.offers as any[]) : [],
        },
        selectedIndustries: Array.isArray(draft.selectedIndustries) ? (draft.selectedIndustries as string[]) : [],
        calibrationProfile: (draft.calibrationProfile as any) ?? {},
        approvedEmailSamples: Array.isArray(draft.approvedEmailSamples) ? (draft.approvedEmailSamples as any[]) : [],
        dailyEmailLimit: draft.dailyEmailLimit ?? 30,
        step: guidedResumeStep(draft),
      };
    }
    return (
      <Page width="narrow">
        <ChadGtmWizard allIndustries={facets.industries.map((i) => i.value)} resume={resume} />
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
      campaignStatus: schema.campaigns.status,
      campaignDeletedAt: schema.campaigns.deletedAt,
      campaignDailyLimit: schema.campaigns.dailyLimit,
    })
    .from(schema.chadGtmRuns)
    .leftJoin(schema.campaigns, eq(schema.campaigns.id, schema.chadGtmRuns.campaignId))
    // Runs of the active workspace (runs without one belong to the default workspace).
    .where(
      and(
        eq(schema.chadGtmRuns.userId, user.id),
        wsCondition(schema.chadGtmRuns.workspaceId, workspace.id, workspace.isDefault),
        isNull(schema.chadGtmRuns.dismissedAt),
      ),
    )
    .orderBy(desc(schema.chadGtmRuns.createdAt))
    .limit(30);

  // One phase per run so a run without a campaign never shows as "Live".
  const ctx = await loadLaunchContext(db, user.id, { workspaceId: workspace.id });
  // After launch the campaign's status and daily limit are the real ones.
  const runs: RunSummary[] = rows.map(
    ({ icpProfile, calibrationProfile, campaignStatus, campaignDeletedAt, campaignDailyLimit, ...r }: any) => ({
      ...r,
      dailyEmailLimit: campaignDailyLimit ?? r.dailyEmailLimit,
      phase: runLaunchState(
        { ...r, icpProfile, calibrationProfile } as any,
        ctx,
        campaignStatus ? { status: campaignStatus, deletedAt: campaignDeletedAt ?? null } : null,
      ).phase,
    }),
  );

  return (
    <AutopilotLauncher
      runs={runs}
      defaultBookingUrl={ctx.defaultBookingUrl ?? null}
      // A new run goes in the active workspace, so its footer carries this identity (#73).
      sender={{
        workspaceName: ctx.workspaceName || workspace.name,
        companyName: ctx.identity.companyName,
        postalAddress: ctx.identity.postalAddress,
      }}
    />
  );
}

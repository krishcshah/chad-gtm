import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getChadGtmRunAction } from "@/lib/chad-gtm-actions";
import { buildPlanPreview, loadLaunchContext, runLaunchState } from "@/lib/autopilot-state";
import { MissionControlView, type LaunchView } from "./mission-control-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mission Control",
  description: "Live real-time telemetry, opens, replies, and controls for AutoGTM autonomous outreach.",
};

export default async function ChadGtmRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const data = await getChadGtmRunAction(id);
  if (!data || !data.run) {
    notFound();
  }

  const ctx = await loadLaunchContext(getDb(), user.id);
  const state = runLaunchState(data.run, ctx);
  const details = state.blockers.find((b) => b.kind === "details");
  const launch: LaunchView = {
    phase: state.phase,
    approved: ctx.approved,
    reason:
      state.phase === "launch_failed"
        ? state.launchFailure?.message ?? null
        : state.blockers[0]?.message ?? null,
    failureCode: state.launchFailure?.code ?? null,
    missing: details && details.kind === "details" ? details.missing : [],
    identity: {
      companyName: ctx.identity.companyName || data.run.companyName || "",
      postalAddress: ctx.identity.postalAddress,
    },
    // Unlaunched runs show the plan and sample emails the client is approving.
    // Not while targeting is ungrounded: those industries/titles were never the client's.
    preview: data.run.campaignId || state.phase === "needs_research" ? null : buildPlanPreview(data.run),
  };

  return <MissionControlView runId={id} initialData={data} launch={launch} />;
}

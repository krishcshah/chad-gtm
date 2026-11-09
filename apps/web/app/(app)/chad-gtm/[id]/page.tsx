import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getChadGtmRunAction } from "@/lib/chad-gtm-actions";
import { buildPlanPreview, loadLaunchContext, runLaunchState } from "@/lib/autopilot-state";
import { getPostalHold, NO_POSTAL_HOLD } from "@/lib/postal-hold";
import { listUserWorkspaces } from "@/lib/workspaces";
import { loadSendingPersona } from "@/lib/sending-personas";
import { countHeldFollowUps } from "@/lib/pool-mailbox-status";
import { loadCustomerPoolShareSafe } from "@/lib/pool-share";
import { WorkspaceMismatchNotice } from "@/components/workspace-mismatch-notice";
import { MissionControlView, type LaunchView } from "./mission-control-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mission control",
  description: "Sends, replies, meetings and controls for one autopilot run.",
};

export default async function ChadGtmRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const { id } = await params;

  // Account-scoped on purpose: links in emails open the run whatever workspace is active.
  const data = await getChadGtmRunAction(id);
  if (!data || !data.run) {
    notFound();
  }

  // The run's workspace (none = the default one) against the active workspace.
  const workspaces = await listUserWorkspaces(user.id).catch(() => []);
  const runWorkspace = data.run.workspaceId
    ? workspaces.find((w) => w.id === data.run.workspaceId) ?? null
    : workspaces.find((w) => w.isDefault) ?? null;
  const sameWorkspace = data.run.workspaceId ? data.run.workspaceId === workspace.id : workspace.isDefault;

  const ctx = await loadLaunchContext(getDb(), user.id, { workspaceId: data.run.workspaceId ?? null });
  const state = runLaunchState(data.run, ctx, data.campaign);
  const details = state.blockers.find((b) => b.kind === "details");
  const { isSystemMailerConfigured } = await import("@smartreach/email-engine/system-mailer");
  // A live run whose campaign the engine is holding for a missing postal address.
  const postalHold = data.run.campaignId
    ? await getPostalHold(user.id, { campaignId: data.run.campaignId })
    : NO_POSTAL_HOLD;
  // The mailbox persona leads actually see: From name and signature (#66).
  const persona = await loadSendingPersona(getDb(), data.run.campaignId ?? null);
  const launch: LaunchView = {
    phase: state.phase,
    approved: ctx.approved,
    emailOnApprove: isSystemMailerConfigured(),
    postalHold,
    reason:
      state.phase === "launch_failed"
        ? state.launchFailure?.message ?? null
        : state.blockers[0]?.message ?? null,
    failureCode: state.launchFailure?.code ?? null,
    missing: details && details.kind === "details" ? details.missing : [],
    // The run's workspace identity, exactly as the footer will carry it (#73).
    identity: {
      companyName: ctx.identity.companyName,
      postalAddress: ctx.identity.postalAddress,
      workspaceName: ctx.workspaceName || runWorkspace?.name || "",
    },
    // The researched name is only a labelled suggestion while the workspace has none.
    suggestedCompanyName: !ctx.identity.companyName.trim() ? data.run.companyName || undefined : undefined,
    // Unlaunched runs show the plan and sample emails the client is approving.
    // Not while targeting is ungrounded: those industries/titles were never the client's.
    // The emails name the workspace's legal sender, as the launched campaign will.
    preview:
      data.run.campaignId || state.phase === "needs_research"
        ? null
        : await buildPlanPreview(data.run, ctx.identity.companyName, persona),
    // What every email and agent reply is signed with (the workspace sender details).
    sender: {
      companyName: ctx.identity.companyName,
      postalAddress: ctx.identity.postalAddress,
      workspaceName: runWorkspace?.name ?? "",
      mailboxes: persona
        ? { poolSize: persona.poolSize, exampleName: persona.name, exampleSignature: persona.signature }
        : null,
    },
    defaultBookingUrl: ctx.defaultBookingUrl ?? null,
    workspaceName: runWorkspace?.name ?? "",
    // Follow-ups waiting for their own mailbox (#60); a count, never fatal.
    heldFollowUps: data.run.campaignId
      ? await countHeldFollowUps(getDb(), data.run.campaignId).catch(() => 0)
      : 0,
    // What the shared mailboxes can send for this run's campaign right now
    // (the customer's share, split across their running campaigns).
    poolShare: await loadCustomerPoolShareSafe(getDb(), user.id, { campaignId: data.run.campaignId }),
  };

  return (
    <MissionControlView
      runId={id}
      initialData={data}
      launch={launch}
      sameWorkspace={sameWorkspace}
      workspaceNotice={
        !sameWorkspace && runWorkspace ? (
          <WorkspaceMismatchNotice workspaceId={runWorkspace.id} workspaceName={runWorkspace.name} />
        ) : null
      }
    />
  );
}

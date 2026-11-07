import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { senderDailyCap } from "@smartreach/shared";
import { Alert, AlertDescription, AlertTitle, Button, PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { listLeadLists, listSenders, listTemplates } from "@/lib/queries";
import { getCampaignSequence, getCampaignWizardState } from "@/lib/actions";
import { Page } from "@/components/layout/page";
import { getDb } from "@/lib/db";
import { loadWorkspaceLeadSettings } from "@/lib/lead-conversations-server";
import { MODE_LABEL } from "@/lib/lead-conversations";
import { CampaignWizard, type CampaignDraftSeed } from "./campaign-wizard";

export const dynamic = "force-dynamic";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; sequenceTemplate?: string; sequence?: string; list?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const draftId = sp.draft?.trim() || "";
  const initialSequenceTemplateId = sp.sequenceTemplate?.trim() || sp.sequence?.trim() || null;
  const initialLeadListId = sp.list?.trim() || null;

  const [lists, senders, templates, draftResult, sequenceResult, leadSettings] = await Promise.all([
    listLeadLists(user.id, workspace.id, workspace.isDefault, { withSendability: true }),
    listSenders(user.id, workspace.id),
    listTemplates(user.id),
    draftId ? getCampaignWizardState(draftId) : Promise.resolve(null),
    draftId ? getCampaignSequence(draftId).catch(() => null) : Promise.resolve(null),
    loadWorkspaceLeadSettings(getDb(), user.id, workspace.id === "primary-default" ? null : workspace.id).catch(() => null),
  ]);

  const initialDraft: CampaignDraftSeed | null =
    draftResult && draftResult.ok && draftResult.data ? draftResult.data : null;
  const draftLoadError = draftId && draftResult && !draftResult.ok ? draftResult.error : null;
  const initialSequence =
    initialDraft && sequenceResult && sequenceResult.ok && sequenceResult.data ? sequenceResult.data.steps : null;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Campaigns
          </Link>
        }
        title={initialDraft ? `Resume “${initialDraft.name || "Untitled campaign"}”` : "New campaign"}
        description={
          initialDraft
            ? "Pick up where you left off. Nothing is sent until you start the campaign on the last step."
            : "Six short steps. Save a draft at any point; nothing is sent until you start the campaign."
        }
      />
      {senders.length === 0 && !isAdmin(user) ? (
        <Alert
          variant="info"
          action={
            <Button size="sm" variant="outline" asChild>
              <Link href="/support">Contact support</Link>
            </Button>
          }
        >
          <AlertTitle>You need a mailbox assigned to your account to send</AlertTitle>
          <AlertDescription>
            Manual campaigns send from a mailbox dedicated to your account; the shared pool only sends Autopilot. You
            can build and save this campaign now, and start it once support assigns a mailbox.{" "}
            <Link
              href="/chad-gtm"
              className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              Use Autopilot instead
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <CampaignWizard
        initialDraft={initialDraft}
        draftLoadError={draftLoadError}
        initialSequenceTemplateId={initialSequenceTemplateId}
        initialLeadListId={initialLeadListId}
        initialSequence={initialSequence}
        workspaceDefaultLabel={leadSettings ? MODE_LABEL[leadSettings.defaultMode] : null}
        leadLists={lists
          // Autopilot's lists belong to its campaigns: a manual campaign would re-email its prospects.
          .filter((l) => !l.isAutopilot || isAdmin(user))
          .map((l) => ({
            id: l.id,
            name: l.name,
            leadCount: Number(l.leadCount),
            sendableCount: l.sendableCount,
            contactedCount: l.contactedCount,
          }))}
        senders={senders
          .filter((s) => s.status !== "failed")
          .map((s) => ({
            id: s.id,
            senderName: s.senderName,
            email: s.email,
            status: s.status,
            dailyLimit: s.dailyLimit,
            usedToday: Number(s.usedToday),
            dailyCap: senderDailyCap({ dailyLimit: s.dailyLimit, createdAt: s.createdAt }),
          }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyText: t.bodyText }))}
      />
    </Page>
  );
}

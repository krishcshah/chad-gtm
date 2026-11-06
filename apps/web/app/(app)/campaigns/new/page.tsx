import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists, listSenders, listTemplates } from "@/lib/queries";
import { getCampaignSequence, getCampaignWizardState } from "@/lib/actions";
import { Page } from "@/components/layout/page";
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

  const [lists, senders, templates, draftResult, sequenceResult] = await Promise.all([
    listLeadLists(user.id, workspace.id),
    listSenders(user.id, workspace.id),
    listTemplates(user.id),
    draftId ? getCampaignWizardState(draftId) : Promise.resolve(null),
    draftId ? getCampaignSequence(draftId).catch(() => null) : Promise.resolve(null),
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
      <CampaignWizard
        initialDraft={initialDraft}
        draftLoadError={draftLoadError}
        initialSequenceTemplateId={initialSequenceTemplateId}
        initialLeadListId={initialLeadListId}
        initialSequence={initialSequence}
        leadLists={lists.map((l) => ({ id: l.id, name: l.name, leadCount: Number(l.leadCount) }))}
        senders={senders
          .filter((s) => s.status !== "failed")
          .map((s) => ({
            id: s.id,
            senderName: s.senderName,
            email: s.email,
            status: s.status,
            dailyLimit: s.dailyLimit,
            usedToday: Number(s.usedToday),
          }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyText: t.bodyText }))}
      />
    </Page>
  );
}

import { requireUser } from "@/lib/session";
import { listLeadLists, listSenders, listTemplates } from "@/lib/queries";
import { getCampaignWizardState } from "@/lib/actions";
import { PageHeader } from "@smartreach/ui";
import { CampaignWizard, type CampaignDraftSeed } from "./campaign-wizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const draftId = sp.draft?.trim() || "";
  const [lists, senders, templates, draftResult] = await Promise.all([
    listLeadLists(user.id),
    listSenders(user.id),
    listTemplates(user.id),
    draftId ? getCampaignWizardState(draftId) : Promise.resolve(null),
  ]);

  const initialDraft: CampaignDraftSeed | null =
    draftResult && draftResult.ok && draftResult.data ? draftResult.data : null;
  const draftLoadError =
    draftId && draftResult && !draftResult.ok ? draftResult.error : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-10">
      <PageHeader
        title={initialDraft ? "Resume campaign" : "Create campaign"}
        description={
          initialDraft
            ? "Pick up where you left off. Save a draft on any step, or publish on the last step."
            : "Six quick steps. Save a draft anytime, or publish on the last step."
        }
      />
      <CampaignWizard
        initialDraft={initialDraft}
        draftLoadError={draftLoadError}
        leadLists={lists.map((l) => ({ id: l.id, name: l.name, leadCount: Number(l.leadCount) }))}
        senders={senders
          .filter((s) => s.status !== "failed")
          .map((s) => ({ id: s.id, senderName: s.senderName, email: s.email, status: s.status, dailyLimit: s.dailyLimit, usedToday: Number(s.usedToday) }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject, bodyText: t.bodyText }))}
      />
    </div>
  );
}

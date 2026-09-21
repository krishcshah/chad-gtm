import { requireUser } from "@/lib/session";
import { hasWorkspacePostalAddress, listLeadLists, listSenders, listTemplates } from "@/lib/queries";
import { PageHeader } from "@smartreach/ui";
import { CampaignWizard } from "./campaign-wizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const user = await requireUser();
  const [lists, senders, templates, hasPostalAddress] = await Promise.all([
    listLeadLists(user.id),
    listSenders(user.id),
    listTemplates(user.id),
    hasWorkspacePostalAddress(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 lg:p-10">
      <PageHeader
        title="Create campaign"
        description="Six quick steps. Sending window defaults to 09:00–17:00."
      />
      <CampaignWizard
        hasPostalAddress={hasPostalAddress}
        leadLists={lists.map((l) => ({ id: l.id, name: l.name, leadCount: Number(l.leadCount) }))}
        senders={senders
          .filter((s) => s.status !== "failed")
          .map((s) => ({ id: s.id, senderName: s.senderName, email: s.email, status: s.status, dailyLimit: s.dailyLimit, usedToday: Number(s.usedToday) }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, subject: t.subject }))}
      />
    </div>
  );
}

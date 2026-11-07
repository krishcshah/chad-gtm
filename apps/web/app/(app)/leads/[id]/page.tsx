import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getLeadList, listLeads, listTags } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { listUsedByPoolCampaign } from "@/lib/pool-campaign-guard";
import { activeCampaignsForList, listDeleteError } from "@/lib/lead-list-guard";
import { Page } from "@/components/layout/page";
import { LeadTable, type LeadRow } from "./lead-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lead list" };

export default async function LeadListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const list = await getLeadList(user.id, id);
  if (!list) notFound();

  const db = getDb();
  const admin = isAdmin(user);
  const [{ items, nextCursor }, tags, readOnly, activeCampaigns] = await Promise.all([
    listLeads(user.id, {
      listId: id,
      workspaceId: workspace.id,
      isDefault: workspace.isDefault,
      search: sp.search,
      status: sp.status,
      pageSize: 50,
    }),
    listTags(user.id),
    // Autopilot lists are read-only for non-admins (#41). On a lookup error, stay read-only.
    admin ? false : listUsedByPoolCampaign(db, id).catch(() => true),
    activeCampaignsForList(db, user.id, id).catch(() => null),
  ]);
  const deleteBlockedReason = activeCampaigns
    ? listDeleteError(activeCampaigns)
    : "Could not check which campaigns use this list. Reload the page and try again.";

  return (
    <Page width="wide">
      <LeadTable
        key={id}
        listName={list.name}
        listId={id}
        totalCount={Number(list.totalLeads ?? 0)}
        initialRows={items as unknown as LeadRow[]}
        initialCursor={nextCursor}
        initialSearch={sp.search ?? ""}
        initialStatus={sp.status ?? ""}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        readOnly={readOnly}
        activeCampaigns={activeCampaigns ?? []}
        deleteBlockedReason={deleteBlockedReason}
      />
    </Page>
  );
}

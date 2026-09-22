import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getLeadList, listLeads, listTags } from "@/lib/queries";
import { LeadTable, type LeadRow } from "./lead-table";

export const dynamic = "force-dynamic";

export default async function LeadListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ search?: string; status?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const list = await getLeadList(user.id, id);
  if (!list) notFound();

  const [{ items, nextCursor }, tags] = await Promise.all([
    listLeads(user.id, { listId: id, search: sp.search, status: sp.status, pageSize: 50 }),
    listTags(user.id),
  ]);

  return (
    <LeadTable
      listName={list.name}
      listId={id}
      initialRows={items as unknown as LeadRow[]}
      initialCursor={nextCursor}
      initialSearch={sp.search ?? ""}
      initialStatus={sp.status ?? ""}
      tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
    />
  );
}

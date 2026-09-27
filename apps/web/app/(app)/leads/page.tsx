import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { getDirectoryFacets, searchLeadsDirectory } from "@/lib/leads-directory";
import { ApolloLeadsView } from "@/components/leads/apollo-leads-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "My Leads & Contact Lists · SmartReach" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = searchParams ? await searchParams : {};
  const defaultTab = sp.tab === "directory" ? "directory" : "saved-lists";

  // Fetch campaign lists, aggregated facets, and initial page of directory leads in parallel
  const [lists, facets, initialResult] = await Promise.all([
    listLeadLists(user.id, workspace.id, workspace.isDefault),
    Promise.resolve().then(() => getDirectoryFacets()),
    Promise.resolve().then(() =>
      searchLeadsDirectory({
        page: 1,
        pageSize: 10,
        sortBy: "default",
        sortOrder: "desc",
      })
    ),
  ]);

  const existingLists = lists.map((l) => ({
    id: l.id,
    name: l.name,
    leadCount: Number(l.leadCount || 0),
    createdAt: l.createdAt,
  }));

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden">
      <ApolloLeadsView
        initialResult={initialResult}
        initialFacets={facets}
        existingLists={existingLists}
        workspaceName={workspace.name}
        defaultTab="saved-lists"
        hideTabs={true}
      />
    </div>
  );
}

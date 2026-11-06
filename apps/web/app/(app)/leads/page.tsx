import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search, Upload } from "lucide-react";
import { Button, PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { isAdmin } from "@/lib/admin";
import { Page } from "@/components/layout/page";
import { LeadListsView } from "./lead-lists-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = searchParams ? await searchParams : {};
  const admin = isAdmin(user);

  // ?tab=saved-lists (and no tab) shows the lists here. The directory tab
  // lives on its own admin-only page.
  if (sp.tab === "directory" && admin) redirect("/b2b-database");

  const lists = await listLeadLists(user.id, workspace.id, workspace.isDefault);
  const rows = lists.map((l) => ({
    id: l.id,
    name: l.name,
    leadCount: Number(l.leadCount || 0),
    createdAt: l.createdAt ? new Date(l.createdAt).toISOString() : null,
  }));

  return (
    <Page>
      <PageHeader
        title="Leads"
        description="Lead lists hold the contacts your campaigns email. Import a CSV, or start an empty list and add people by hand."
        actions={
          <>
            {admin ? (
              <Button variant="ghost" asChild>
                <Link href="/b2b-database">
                  <Search />
                  Find leads
                </Link>
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <Link href="/leads/new">
                <Plus />
                New list
              </Link>
            </Button>
            <Button asChild>
              <Link href="/leads/import">
                <Upload />
                Import CSV
              </Link>
            </Button>
          </>
        }
      />
      <LeadListsView lists={rows} />
    </Page>
  );
}

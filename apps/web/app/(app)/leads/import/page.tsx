import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { Button } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { LeadImport } from "./lead-import";

export const dynamic = "force-dynamic";

export default async function LeadImportPage({
  searchParams,
}: {
  searchParams?: Promise<{ listId?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const lists = await listLeadLists(user.id, workspace.id, workspace.isDefault);
  const sp = searchParams ? await searchParams : {};

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl p-6 lg:p-10 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/leads?tab=saved-lists" className="hover:text-foreground transition-colors flex items-center gap-1">
              <Users className="size-3" />
              Saved Lists
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Import CSV</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Import Leads to Saved List</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload your CSV file, map the columns, and import contacts directly into your saved workspace lists for campaign outreach.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs font-semibold self-start sm:self-auto">
          <Link href="/leads?tab=saved-lists">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Saved Lists
          </Link>
        </Button>
      </div>

      <LeadImport
        lists={lists.map((l) => ({ id: l.id, name: l.name }))}
        initialListId={sp.listId}
      />
    </div>
  );
}

import { requireUser } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { LeadImport } from "./lead-import";

export const dynamic = "force-dynamic";

export default async function LeadImportPage() {
  const user = await requireUser();
  const lists = await listLeadLists(user.id);
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl p-6 lg:p-10">
      <h1 className="text-2xl font-semibold tracking-tight">Import Leads</h1>
      <p className="mb-8 mt-1 text-sm text-muted-foreground">
        Upload a CSV, map the columns, import. Everything unmapped becomes a merge variable.
      </p>
      <LeadImport lists={lists.map((l) => ({ id: l.id, name: l.name }))} />
    </div>
  );
}

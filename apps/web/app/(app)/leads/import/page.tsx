import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { isAdmin } from "@/lib/admin";
import { Page } from "@/components/layout/page";
import { LeadImport } from "./lead-import";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import leads" };

export default async function LeadImportPage({
  searchParams,
}: {
  searchParams?: Promise<{ listId?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const allLists = await listLeadLists(user.id, workspace.id, workspace.isDefault);
  // Autopilot lists are read-only for non-admins (#41), so they can't be an import target.
  const lists = isAdmin(user) ? allLists : allLists.filter((l) => !l.isAutopilot);
  const sp = searchParams ? await searchParams : {};
  const target = sp.listId ? lists.find((l) => l.id === sp.listId) : undefined;

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={
          <Link
            href={target ? `/leads/${target.id}` : "/campaigns#lead-lists"}
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {target ? target.name : "Lead lists"}
          </Link>
        }
        title="Import leads"
        description={
          target
            ? `Upload a CSV, check the preview, then match its columns. New contacts are added to ${target.name}.`
            : "Upload a CSV, check the preview, then match its columns to lead fields. You choose the list at the last step."
        }
      />
      <LeadImport lists={lists.map((l) => ({ id: l.id, name: l.name }))} initialListId={target?.id} />
    </Page>
  );
}

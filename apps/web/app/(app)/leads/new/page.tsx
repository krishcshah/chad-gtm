import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { Page } from "@/components/layout/page";
import { NewLeadListForm } from "./new-lead-list-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "New lead list" };

export default async function NewLeadListPage() {
  await requireUser();
  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Campaigns & leads
          </Link>
        }
        title="New lead list"
        description="Start an empty list, then import contacts or add them one at a time."
      />
      <NewLeadListForm />
    </Page>
  );
}

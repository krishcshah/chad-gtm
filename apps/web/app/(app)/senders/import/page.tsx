import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { Page } from "@/components/layout/page";
import { SenderImport } from "./sender-import";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import mailboxes" };

export default async function SenderImportPage() {
  await requireUser();
  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={
          <Link href="/senders" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Mailboxes
          </Link>
        }
        title="Import mailboxes"
        description="Connect several mailboxes at once from a CSV file. Each row is checked on its own, so one bad row doesn't stop the rest."
      />
      <SenderImport />
    </Page>
  );
}

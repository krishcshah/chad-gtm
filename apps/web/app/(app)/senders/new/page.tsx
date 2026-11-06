import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@smartreach/ui";
import { requireUser } from "@/lib/session";
import { Page } from "@/components/layout/page";
import { SenderForm } from "../sender-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connect a mailbox" };

export default async function NewSenderPage() {
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
        title="Connect a mailbox"
        description="Add an email account with its SMTP login. AutoGTM sends campaign email from it and, with IMAP, watches it for replies."
      />
      <SenderForm />
    </Page>
  );
}

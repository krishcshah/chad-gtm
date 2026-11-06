import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, Badge, PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import {
  DIRECTORY_ADMIN_EXPORT_LIMIT,
  DIRECTORY_ADMIN_SAVE_LIMIT,
  DIRECTORY_PAID_ROW_LIMIT,
  getDirectoryFacets,
  searchLeadsDirectory,
} from "@/lib/leads-directory";
import { isAdmin } from "@/lib/admin";
import { Page } from "@/components/layout/page";
import { ApolloLeadsView } from "@/components/leads/apollo-leads-view";
import { B2bPaywall } from "@/components/leads/b2b-paywall";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "B2B directory",
  description: "Search business contacts by role, industry, country and company size, and add them to lead lists.",
};

const INITIAL_PAGE_SIZE = 25;

export default async function B2bDatabasePage({
  searchParams,
}: {
  searchParams?: Promise<{
    tab?: string;
    payment?: string;
    unlocked?: string;
    preview?: string;
  }>;
}) {
  const { user, workspace } = await requireWorkspace();
  // The directory is admin-only for now; admins have full, unmasked access.
  if (!isAdmin(user)) {
    redirect("/chad-gtm");
  }

  const params = (await searchParams) ?? {};
  // Admins can see the paywall that accounts without directory access get.
  const isPreviewingPaywall = params.preview === "paywall";

  const [lists, facets] = await Promise.all([
    listLeadLists(user.id, workspace.id, workspace.isDefault),
    Promise.resolve().then(() => getDirectoryFacets()),
  ]);

  if (isPreviewingPaywall) {
    return (
      <Page width="narrow">
        <PageHeader
          eyebrow={
            <Link href="/b2b-database" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden />
              B2B directory
            </Link>
          }
          title="Paywall preview"
          description="This is what people without directory access see on this page."
        />
        <Alert
          variant="info"
          action={
            <Link
              href="/b2b-database"
              className="text-[13px] font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              Exit preview
            </Link>
          }
        >
          You are previewing the paywall. Your own access is not affected, but the Stripe link is live.
        </Alert>
        <B2bPaywall
          userEmail={user.email}
          userId={user.id}
          totalLeadsCount={facets.totalLeads}
          rowLimit={DIRECTORY_PAID_ROW_LIMIT}
        />
      </Page>
    );
  }

  const initialResult = searchLeadsDirectory({
    page: 1,
    pageSize: INITIAL_PAGE_SIZE,
    sortBy: "default",
    sortOrder: "desc",
  });

  const existingLists = lists.map((l) => ({
    id: l.id,
    name: l.name,
    leadCount: Number(l.leadCount || 0),
    createdAt: l.createdAt,
  }));

  return (
    <Page full>
      <ApolloLeadsView
        initialResult={initialResult}
        initialFacets={facets}
        existingLists={existingLists}
        saveLimit={DIRECTORY_ADMIN_SAVE_LIMIT}
        exportLimit={DIRECTORY_ADMIN_EXPORT_LIMIT}
        meta={
          <>
            <Badge variant="info">Admin</Badge>
            <span className="text-[13px] text-muted-foreground">
              Full access to every record.{" "}
              <Link
                href="/b2b-database?preview=paywall"
                className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
              >
                Preview paywall
              </Link>
            </span>
          </>
        }
      />
    </Page>
  );
}

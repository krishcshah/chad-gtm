import Link from "next/link";
import { Eye, ShieldCheck } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { listLeadLists } from "@/lib/queries";
import { getDirectoryFacets, searchLeadsDirectory } from "@/lib/leads-directory";
import { ApolloLeadsView } from "@/components/leads/apollo-leads-view";
import { isAdmin } from "@/lib/admin";
import { hasB2BAccess, grantB2BAccess } from "@/lib/b2b-access";
import { B2bPaywall } from "@/components/leads/b2b-paywall";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "B2B Database · 300k+ Verified Leads · SmartReach",
  description:
    "Search 300,000+ verified B2B decision-makers, filter by company size, seniority, and industry, and export directly to campaigns.",
};

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
  const sp = searchParams ? await searchParams : {};

  const userIsAdmin = isAdmin(user);

  // Auto-grant access if returning from Stripe checkout success
  if (sp.payment === "success" || sp.unlocked === "1") {
    await grantB2BAccess(user.id, { source: "stripe_checkout" });
  }

  // Check access status: Admin is NEVER blocked
  const hasAccess = userIsAdmin || (await hasB2BAccess(user.id, user.email));

  // Admin preview toggle: let admin view what non-paying users see
  const isPreviewingPaywall = userIsAdmin && sp.preview === "paywall";

  // Fetch directory facets and initial leads in parallel
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

  // Render Paywall if user has no access or admin is in preview mode
  if (!hasAccess || isPreviewingPaywall) {
    return (
      <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-4">
        {userIsAdmin && (
          <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
            <span className="flex items-center gap-2">
              <Eye className="size-4" />
              <span>
                <strong>Admin Preview Mode:</strong> You are viewing the Paywall as seen by non-paying users.
              </span>
            </span>
            <Link
              href="/b2b-database"
              className="font-bold underline hover:text-white"
            >
              Exit Preview & Return to Live Database
            </Link>
          </div>
        )}
        <B2bPaywall
          userEmail={user.email}
          userId={user.id}
          totalLeadsCount={facets.totalLeads}
        />
      </div>
    );
  }

  // Render full unlocked B2B Database Directory view
  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-3">
      {userIsAdmin && (
        <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary">
          <span className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-4 text-emerald-400" />
            <span>
              <strong>Admin Access:</strong> You have permanent unrestricted access to the 300K+ B2B Leads Database.
            </span>
          </span>
          <Link
            href="/b2b-database?preview=paywall"
            className="text-[11px] font-semibold underline hover:text-foreground text-primary/80"
          >
            Preview Paywall View
          </Link>
        </div>
      )}

      <ApolloLeadsView
        initialResult={initialResult}
        initialFacets={facets}
        existingLists={existingLists}
        workspaceName={workspace.name}
        defaultTab="directory"
        hideTabs={true}
      />
    </div>
  );
}

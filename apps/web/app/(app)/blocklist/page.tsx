import Link from "next/link";
import { listSuppressions } from "@/lib/actions";
import { Button, PageHeader, StatePanel } from "@smartreach/ui";
import { BlocklistManager, type KindFilter } from "./blocklist-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Blocklist" };

const DESCRIPTION =
  "Emails and domains the sending engine skips when a campaign is queued and when it sends.";

function parseKind(value: string | undefined): KindFilter {
  if (value === "email" || value === "domain") return value;
  return "all";
}

function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

export default async function BlocklistPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; kind?: string }>;
}) {
  const sp = await searchParams;
  const kind = parseKind(sp.kind);
  const search = sp.search?.trim() ?? "";
  const retryHref = blocklistHref(search, kind);

  const result = await listSuppressions({
    search: search || undefined,
    kind: kind === "all" ? undefined : kind,
    limit: 50,
  });

  if (!result.ok || !result.data) {
    const message = result.ok ? "The blocklist could not be loaded." : result.error;
    const denied = isDenied(message);
    return (
      <div className="page-stack">
        <PageHeader title="Blocklist" description={DESCRIPTION} />
        <StatePanel
          kind={denied ? "permission" : "error"}
          title={denied ? "Access denied" : "Could not load the blocklist"}
          description={
            denied
              ? "You do not have permission to view this blocklist. Sign in with an allowed account, or go back to the dashboard."
              : message
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={retryHref}>Try again</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Back to dashboard</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <BlocklistManager
      description={DESCRIPTION}
      initialItems={result.data.items}
      initialNextCursor={result.data.nextCursor}
      initialSearch={search}
      initialKind={kind}
    />
  );
}

function blocklistHref(search: string, kind: KindFilter) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (kind !== "all") params.set("kind", kind);
  const qs = params.toString();
  return qs ? `/blocklist?${qs}` : "/blocklist";
}

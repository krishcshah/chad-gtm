import { requireWorkspace } from "@/lib/session";
import { listSuppressions } from "@/lib/actions";
import { BlocklistManager, type BlocklistItem, type KindFilter } from "./blocklist-manager";

export const dynamic = "force-dynamic";

export const metadata = { title: "Blocklist" };

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function BlocklistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireWorkspace();
  const params = await searchParams;
  const search = first(params.search).slice(0, 200);
  const kindParam = first(params.kind);
  const kind: KindFilter = kindParam === "email" || kindParam === "domain" ? kindParam : "all";

  let items: BlocklistItem[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;
  try {
    const result = await listSuppressions({
      search: search.trim() || undefined,
      kind: kind === "all" ? undefined : kind,
      limit: 50,
    });
    if (result.ok && result.data) {
      items = result.data.items;
      nextCursor = result.data.nextCursor;
    } else {
      error = result.ok ? "The blocklist could not be loaded." : result.error;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "The blocklist could not be loaded.";
  }

  return (
    <BlocklistManager
      initialItems={items}
      initialNextCursor={nextCursor}
      initialSearch={search}
      initialKind={kind}
      initialError={error}
    />
  );
}

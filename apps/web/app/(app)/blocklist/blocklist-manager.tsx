"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Plus, Search, Trash2, Upload } from "lucide-react";
import { formatDate, formatDateTime } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SegmentedControl,
  StatePanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  cn,
} from "@smartreach/ui";
import { listSuppressions } from "@/lib/actions";
import { Page } from "@/components/layout/page";
import {
  AddToBlocklistDialog,
  ImportBlocklistDialog,
  RemoveFromBlocklistDialog,
  kindLabel,
  sourceLabel,
  type BlocklistItem,
} from "./blocklist-dialogs";

export type { BlocklistItem } from "./blocklist-dialogs";
export type KindFilter = "all" | "email" | "domain";

const PAGE_SIZE = 50;

function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

/** Keep ?search= and ?kind= in the address bar so the view can be shared and survives a reload. */
function syncUrl(search: string, kind: KindFilter) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (kind !== "all") params.set("kind", kind);
  const qs = params.toString();
  window.history.replaceState(null, "", qs ? `/blocklist?${qs}` : "/blocklist");
}

export function BlocklistManager({
  initialItems,
  initialNextCursor,
  initialSearch,
  initialKind,
  initialError = null,
}: {
  initialItems: BlocklistItem[];
  initialNextCursor: string | null;
  initialSearch: string;
  initialKind: KindFilter;
  initialError?: string | null;
}) {
  const requestId = useRef(0);
  const skipFirstFetch = useRef(true);

  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [kind, setKind] = useState<KindFilter>(initialKind);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BlocklistItem | null>(null);

  const load = useCallback(async (opts: { search: string; kind: KindFilter; cursor?: string; append: boolean }) => {
    const id = ++requestId.current;
    if (opts.append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    let result: Awaited<ReturnType<typeof listSuppressions>>;
    try {
      result = await listSuppressions({
        search: opts.search.trim() || undefined,
        kind: opts.kind === "all" ? undefined : opts.kind,
        cursor: opts.cursor,
        limit: PAGE_SIZE,
      });
    } catch {
      result = { ok: false, error: "The blocklist could not be loaded. Check your connection and try again." };
    }
    if (id !== requestId.current) return;
    setLoading(false);
    setLoadingMore(false);
    const data = result.ok ? result.data : undefined;
    if (!result.ok || !data) {
      setError(result.ok ? "The blocklist could not be loaded." : result.error);
      if (!opts.append) {
        setItems([]);
        setNextCursor(null);
      }
      return;
    }
    setItems((current) => (opts.append ? [...current, ...data.items] : data.items));
    setNextCursor(data.nextCursor);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    syncUrl(debouncedSearch, kind);
    void load({ search: debouncedSearch, kind, append: false });
  }, [debouncedSearch, kind, load]);

  const reload = () => load({ search: debouncedSearch, kind, append: false });
  const filtered = search.trim().length > 0 || kind !== "all";

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setKind("all");
  }

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/settings#blocklist" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden /> Settings
          </Link>
        }
        title="Blocklist"
        description="Emails and domains your campaigns never send to. They are checked when a campaign is queued and again just before each email goes out."
        actions={
          <>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Import
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add address
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emails or domains"
              aria-label="Search blocklist"
              className="pl-9"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <SegmentedControl<KindFilter>
            aria-label="Filter by type"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "all", label: "All" },
              { value: "email", label: "Emails" },
              { value: "domain", label: "Domains" },
            ]}
            className="self-start sm:self-auto"
          />
        </div>

        <div aria-busy={loading} aria-live="polite">
          {error ? (
            isDenied(error) ? (
              <StatePanel
                kind="permission"
                description="You do not have access to this blocklist. Sign in with the account that owns it."
                action={
                  <Button variant="outline" size="sm" onClick={() => void reload()}>
                    Try again
                  </Button>
                }
              />
            ) : (
              <ErrorState title="Could not load the blocklist" description={error} onRetry={() => void reload()} />
            )
          ) : loading && items.length === 0 ? (
            <TableSkeleton rows={6} cols={4} />
          ) : items.length === 0 ? (
            filtered ? (
              <EmptyState
                icon={Search}
                title="No matching addresses"
                description="Nothing on the blocklist matches this search."
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Ban}
                title="Your blocklist is empty"
                description="Block competitors, existing customers or anyone who asked not to be contacted. People who unsubscribe are added automatically."
                action={
                  <>
                    <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                      <Upload /> Import a list
                    </Button>
                    <Button size="sm" onClick={() => setAddOpen(true)}>
                      <Plus /> Add address
                    </Button>
                  </>
                }
              />
            )
          ) : (
            <div className="flex flex-col gap-3">
              <Card className={cn("overflow-hidden transition-opacity", loading && "opacity-60")}>
                <AddressTable items={items} onRemove={setRemoveTarget} />
                <AddressList items={items} onRemove={setRemoveTarget} />
              </Card>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
                <p className="text-xs text-subtle-foreground">
                  {loading
                    ? "Updating…"
                    : `Showing ${items.length.toLocaleString()}${nextCursor ? " so far" : ""}`}
                </p>
                {nextCursor ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={loadingMore}
                    disabled={loading}
                    onClick={() => void load({ search: debouncedSearch, kind, cursor: nextCursor, append: true })}
                  >
                    Load more
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <AddToBlocklistDialog open={addOpen} onOpenChange={setAddOpen} onAdded={reload} />
      <ImportBlocklistDialog open={importOpen} onOpenChange={setImportOpen} onImported={reload} />
      <RemoveFromBlocklistDialog
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={(id) => setItems((current) => current.filter((item) => item.id !== id))}
      />
    </Page>
  );
}

type RowProps = { items: BlocklistItem[]; onRemove: (item: BlocklistItem) => void };

function RemoveButton({ item, onRemove }: { item: BlocklistItem; onRemove: (item: BlocklistItem) => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Unblock ${item.value}`}
      title="Unblock"
      onClick={() => onRemove(item)}
      className="hover:text-destructive-text"
    >
      <Trash2 />
    </Button>
  );
}

/** Desktop: table. */
function AddressTable({ items, onRemove }: RowProps) {
  return (
    <div className="hidden sm:block">
      <Table>
        <caption className="sr-only">Blocked emails and domains</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col">Address</TableHead>
            <TableHead scope="col">Source</TableHead>
            <TableHead scope="col">Reason</TableHead>
            <TableHead scope="col">Added</TableHead>
            <TableHead scope="col" className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-[18rem]">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[13px]">{item.value}</span>
                  {item.kind === "domain" ? <Badge variant="neutral">Domain</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{sourceLabel(item.source)}</TableCell>
              <TableCell className="max-w-[14rem] text-muted-foreground">
                <span className="block truncate" title={item.reason || undefined}>
                  {item.reason?.trim() || <span className="text-subtle-foreground">—</span>}
                </span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)} suppressHydrationWarning>
                  {formatDate(item.createdAt)}
                </time>
              </TableCell>
              <TableCell className="text-right">
                <RemoveButton item={item} onRemove={onRemove} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phone: compact list. */
function AddressList({ items, onRemove }: RowProps) {
  return (
    <ul className="divide-y divide-border sm:hidden">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[13px]">{item.value}</p>
            <p className="mt-0.5 text-xs text-subtle-foreground">
              {kindLabel(item.kind)} · {sourceLabel(item.source)} ·{" "}
              <time dateTime={item.createdAt} suppressHydrationWarning>
                {formatDate(item.createdAt)}
              </time>
            </p>
            {item.reason?.trim() ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.reason}</p>
            ) : null}
          </div>
          <RemoveButton item={item} onRemove={onRemove} />
        </li>
      ))}
    </ul>
  );
}

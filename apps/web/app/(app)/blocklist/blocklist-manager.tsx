"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Ban, FileUp, Plus, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@smartreach/shared";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  StatePanel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Textarea,
} from "@smartreach/ui";
import { addSuppression, importSuppressions, listSuppressions, removeSuppression } from "@/lib/actions";

export type BlocklistItem = {
  id: string;
  value: string;
  kind: string;
  reason: string;
  source: string;
  createdAt: string;
};

export type KindFilter = "all" | "email" | "domain";
type EntryKind = "email" | "domain";

const PAGE_SIZE = 50;

function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

function sourceLabel(source: string) {
  switch (source) {
    case "manual":
      return "Manual";
    case "import":
      return "Import";
    case "unsubscribe":
      return "Unsubscribe";
    default:
      return source || "Unknown";
  }
}

function filterLabel(kind: KindFilter) {
  if (kind === "email") return "Emails";
  if (kind === "domain") return "Domains";
  return "All kinds";
}

function kindLabel(kind: string) {
  if (kind === "domain") return "Domain";
  if (kind === "email") return "Email";
  return kind || "Address";
}

function syncUrl(search: string, kind: KindFilter) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (kind !== "all") params.set("kind", kind);
  const qs = params.toString();
  const next = qs ? `/blocklist?${qs}` : "/blocklist";
  window.history.replaceState(null, "", next);
}

function importSummary(data: { added: number; skipped: number; invalid: number }) {
  const added =
    data.added === 1 ? "Added 1 address." : `Added ${data.added} addresses.`;
  const skipped =
    data.skipped === 1
      ? "Skipped 1 that was already on the blocklist."
      : `Skipped ${data.skipped} that were already on the blocklist.`;
  const invalid =
    data.invalid === 1
      ? "1 line was not a valid email or domain."
      : `${data.invalid} lines were not valid emails or domains.`;
  return `${added} ${skipped} ${invalid}`;
}

export function BlocklistManager({
  description,
  initialItems,
  initialNextCursor,
  initialSearch,
  initialKind,
}: {
  description: string;
  initialItems: BlocklistItem[];
  initialNextCursor: string | null;
  initialSearch: string;
  initialKind: KindFilter;
}) {
  const searchId = useId();
  const kindId = useId();
  const fileId = useId();
  const requestId = useRef(0);
  const skipFirstFetch = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [kind, setKind] = useState<KindFilter>(initialKind);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "add" | "import" | "remove">(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<EntryKind>("email");
  const [addValue, setAddValue] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<BlocklistItem | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(
    async (opts: { search: string; kind: KindFilter; cursor?: string; append: boolean }) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      setDenied(false);
      const result = await listSuppressions({
        search: opts.search.trim() || undefined,
        kind: opts.kind === "all" ? undefined : opts.kind,
        cursor: opts.cursor,
        limit: PAGE_SIZE,
      });
      if (id !== requestId.current) return;
      setLoading(false);
      const data = result.ok ? result.data : undefined;
      if (!result.ok || !data) {
        const message = result.ok ? "The blocklist could not be loaded." : result.error;
        setError(message);
        setDenied(isDenied(message));
        if (!opts.append) {
          setItems([]);
          setNextCursor(null);
        }
        return;
      }
      setItems((current) => (opts.append ? [...current, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    },
    [],
  );

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

  const filtered = search.trim().length > 0 || kind !== "all";

  function resetAdd() {
    setAddKind("email");
    setAddValue("");
    setAddReason("");
    setAddError(null);
  }

  function resetImport() {
    setImportText("");
    setImportFileName("");
    setImportError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("add");
    setAddError(null);
    const result = await addSuppression({
      value: addValue,
      kind: addKind,
      reason: addReason,
    });
    setBusy(null);
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    const message = /already/i.test(result.message ?? "")
      ? "That address is already on the blocklist."
      : "Added to the blocklist.";
    setNotice(message);
    toast.success(message);
    setAddOpen(false);
    resetAdd();
    await load({ search: debouncedSearch, kind, append: false });
  }

  async function onImport(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const text = importText.trim();
    if (!text) {
      setImportError("Paste at least one email or domain, or choose a file.");
      return;
    }
    setBusy("import");
    setImportError(null);
    const result = await importSuppressions({ text });
    setBusy(null);
    if (!result.ok || !result.data) {
      setImportError(result.ok ? "Import did not return a result." : result.error);
      return;
    }
    const message = importSummary(result.data);
    setNotice(message);
    toast.success(message);
    setImportOpen(false);
    resetImport();
    await load({ search: debouncedSearch, kind, append: false });
  }

  async function onFile(file: File) {
    if (file.size > 2_000_000) {
      setImportError("That file is larger than 2 MB. Split it into smaller lists.");
      return;
    }
    try {
      const text = await file.text();
      setImportText(text);
      setImportFileName(file.name);
      setImportError(null);
    } catch {
      setImportError("That file could not be read. Paste the addresses instead.");
    }
  }

  async function onRemove() {
    if (!removeTarget || busy) return;
    setBusy("remove");
    setRemoveError(null);
    const result = await removeSuppression(removeTarget.id);
    setBusy(null);
    if (!result.ok) {
      setRemoveError(result.error);
      return;
    }
    const removed = removeTarget.value;
    setItems((current) => current.filter((item) => item.id !== removeTarget.id));
    setRemoveTarget(null);
    const message = `Removed ${removed} from the blocklist.`;
    setNotice(message);
    toast.success(message);
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Blocklist"
        description={description}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                resetImport();
                setImportOpen(true);
              }}
            >
              <Upload /> Import
            </Button>
            <Button
              size="sm"
              type="button"
              onClick={() => {
                resetAdd();
                setAddOpen(true);
              }}
            >
              <Plus /> Add address
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Label htmlFor={searchId} className="sr-only">
            Search blocklist
          </Label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search emails or domains"
            className="pl-9"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="w-full sm:w-44">
          <Label htmlFor={kindId} className="sr-only">
            Filter by kind
          </Label>
          <Select value={kind} onValueChange={(value) => setKind(value as KindFilter)}>
            <SelectTrigger id={kindId} aria-label="Filter by kind">
              <span>{filterLabel(kind)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
              <SelectItem value="domain">Domains</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {notice ? (
        <p role="status" className="text-sm text-success-foreground">
          {notice}
        </p>
      ) : null}

      <div aria-busy={loading} aria-live="polite">
        {loading ? <span className="sr-only">Loading blocklist</span> : null}
        {error ? (
          denied ? (
            <StatePanel
              kind="permission"
              title="Access denied"
              description="You do not have permission to view this blocklist. Sign in with an allowed account, or try again."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => void load({ search: debouncedSearch, kind, append: false })}
                >
                  Try again
                </Button>
              }
            />
          ) : (
            <ErrorState
              title="Could not load the blocklist"
              description={error}
              onRetry={() => void load({ search: debouncedSearch, kind, append: false })}
            />
          )
        ) : items.length === 0 && loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Ban}
            title={filtered ? "No matching addresses" : "Blocklist is empty"}
            description={
              filtered
                ? "Nothing on the blocklist matches this search or kind. Clear the filters or add the address."
                : "Add an email or domain, or import a list. Campaigns skip these addresses at enqueue and at send."
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                    setKind("all");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    resetAdd();
                    setAddOpen(true);
                  }}
                >
                  <Plus /> Add address
                </Button>
              )
            }
          />
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {loading ? "Updating the blocklist…" : `Showing ${items.length}${nextCursor ? "+" : ""}`}
            </p>
            <div className={loading ? "opacity-60" : undefined}>
              <AddressTable items={items} onRemove={setRemoveTarget} />
              <AddressCards items={items} onRemove={setRemoveTarget} />
            </div>
            {nextCursor ? (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={loading || busy !== null}
                  onClick={() =>
                    void load({
                      search: debouncedSearch,
                      kind,
                      cursor: nextCursor,
                      append: true,
                    })
                  }
                >
                  {loading ? "Loading…" : "Load more addresses"}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) resetAdd();
        }}
      >
        <DialogContent>
          <form onSubmit={(e) => void onAdd(e)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add to blocklist</DialogTitle>
              <DialogDescription>
                Block one email, or a whole domain. The sending engine skips it on enqueue and on send.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="blocklist-add-kind">Kind</Label>
              <Select value={addKind} onValueChange={(value) => setAddKind(value as EntryKind)}>
                <SelectTrigger id="blocklist-add-kind">
                  <span>{addKind === "domain" ? "Domain" : "Email"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {addKind === "domain"
                  ? "example.com or @example.com blocks every address at that domain."
                  : "Only this exact address is blocked."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blocklist-add-value">{addKind === "domain" ? "Domain" : "Email"}</Label>
              <Input
                id="blocklist-add-value"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                placeholder={addKind === "domain" ? "example.com" : "name@company.com"}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-invalid={addError ? true : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="blocklist-add-reason">Reason (optional)</Label>
              <Input
                id="blocklist-add-reason"
                value={addReason}
                onChange={(e) => setAddReason(e.target.value)}
                placeholder="Competitor, unsubscribe, bounced…"
                maxLength={500}
              />
            </div>
            {addError ? (
              <p role="alert" className="text-sm text-destructive">
                {addError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy !== null || !addValue.trim()}>
                {busy === "add" ? "Adding…" : "Add to blocklist"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) resetImport();
        }}
      >
        <DialogContent>
          <form onSubmit={(e) => void onImport(e)} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Import blocklist</DialogTitle>
              <DialogDescription>
                Paste addresses or choose a text or CSV file. One email, @domain, or bare domain per
                line. Commas work too. Up to 10,000 lines.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="blocklist-import-text">Addresses</Label>
              <Textarea
                id="blocklist-import-text"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                rows={8}
                placeholder={"ada@company.com\n@competitor.com\nvendor.io"}
                spellCheck={false}
                aria-invalid={importError ? true : undefined}
                className="font-mono text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                ref={fileRef}
                id={fileId}
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp /> Choose file
              </Button>
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {importFileName || "No file chosen. You can paste instead."}
              </p>
            </div>
            {importError ? (
              <p role="alert" className="text-sm text-destructive">
                {importError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy !== null || !importText.trim()}>
                {busy === "import" ? "Importing…" : "Import addresses"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveTarget(null);
            setRemoveError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove from blocklist</DialogTitle>
            <DialogDescription className="break-all">
              {removeTarget
                ? `${removeTarget.value} will no longer be skipped when campaigns are queued or sent.`
                : "This address will no longer be skipped."}
            </DialogDescription>
          </DialogHeader>
          {removeError ? (
            <p role="alert" className="text-sm text-destructive">
              {removeError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy !== null}
              onClick={() => void onRemove()}
            >
              {busy === "remove" ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddressTable({
  items,
  onRemove,
}: {
  items: BlocklistItem[];
  onRemove: (item: BlocklistItem) => void;
}) {
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
      <Table>
        <caption className="sr-only">Blocked emails and domains</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Address</TableHead>
            <TableHead scope="col">Kind</TableHead>
            <TableHead scope="col">Source</TableHead>
            <TableHead scope="col">Reason</TableHead>
            <TableHead scope="col">Added</TableHead>
            <TableHead scope="col">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="max-w-[16rem] font-mono">
                <span className="block truncate">{item.value}</span>
              </TableCell>
              <TableCell>
                <Badge variant={item.kind === "domain" ? "warning" : "info"}>{kindLabel(item.kind)}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{sourceLabel(item.source)}</Badge>
              </TableCell>
              <TableCell className="max-w-[14rem] text-muted-foreground">
                <span className="block truncate">{item.reason?.trim() || "—"}</span>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  aria-label={`Remove ${item.value} from blocklist`}
                  onClick={() => onRemove(item)}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AddressCards({
  items,
  onRemove,
}: {
  items: BlocklistItem[];
  onRemove: (item: BlocklistItem) => void;
}) {
  return (
    <ul className="space-y-2 sm:hidden">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-sm">{item.value}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-destructive hover:text-destructive"
              aria-label={`Remove ${item.value} from blocklist`}
              onClick={() => onRemove(item)}
            >
              Remove
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant={item.kind === "domain" ? "warning" : "info"}>{kindLabel(item.kind)}</Badge>
            <Badge variant="outline">{sourceLabel(item.source)}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {item.reason?.trim() ? item.reason : "No reason"}
            {" · "}
            <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  PageHeader,
  PermissionDenied,
} from "@smartreach/ui";
import { bulkTagLeads, fetchLeadsPage, updateLeadStatus } from "@/lib/actions";
import { asCustomFields, isNextRedirect, isPermissionError } from "@/lib/lead-form";
import { LeadFormDialog, type LeadFormLead } from "./lead-form-dialog";
import { DeleteLeadsDialog, DeleteListDialog, RenameListDialog } from "./lead-manage-dialogs";
import { downloadLeadsCsv } from "./lead-export";
import { NewTagDialog, type TagOpt } from "./lead-tags";
import { BulkActionBar, LeadToolbar } from "./lead-toolbar";
import { LeadRowsTable } from "./lead-rows-table";

export interface LeadRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  tags: string[] | null;
  customFields?: Record<string, string> | null;
  jobTitle?: string | null;
  createdAt?: string | Date | null;
}

const PAGE_SIZE = 50;

function normalizeRow(row: LeadRow): LeadRow {
  return { ...row, customFields: asCustomFields(row.customFields) };
}

function fileSlug(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "leads";
}

export function LeadTable({
  listName,
  listId,
  totalCount,
  initialRows,
  initialCursor,
  initialSearch,
  initialStatus,
  tags,
}: {
  listName: string;
  listId: string;
  totalCount?: number;
  initialRows: LeadRow[];
  initialCursor?: string;
  initialSearch: string;
  initialStatus: string;
  tags: TagOpt[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LeadRow[]>(() => initialRows.map(normalizeRow));
  const [cursor, setCursor] = useState<string | undefined>(initialCursor);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [title, setTitle] = useState(listName);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteListOpen, setDeleteListOpen] = useState(false);
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<{ mode: "one" | "bulk"; leads: { id: string; email: string }[] } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagList, setTagList] = useState(tags);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [editor, setEditor] = useState<{ mode: "create" | "edit"; lead: LeadRow | null; nonce: number } | null>(null);
  const [pending, start] = useTransition();
  const [listPending, startList] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setTitle(listName);
  }, [listName]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const tagById = useMemo(() => Object.fromEntries(tagList.map((t) => [t.id, t])), [tagList]);

  const writeFilterUrl = (q: string, s: string) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (s) params.set("status", s);
    const qs = params.toString();
    router.replace(qs ? `/leads/${listId}?${qs}` : `/leads/${listId}`, { scroll: false });
  };

  const handleLoadFailure = (error: unknown) => {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : "Could not load leads";
    if (isPermissionError(message)) setDenied(true);
    else setLoadError(message);
  };

  const applyFilters = (q: string, s: string) => {
    const id = ++requestId.current;
    writeFilterUrl(q, s);
    startList(async () => {
      try {
        const res = await fetchLeadsPage({ listId, search: q || undefined, status: s || undefined, pageSize: PAGE_SIZE });
        if (id !== requestId.current) return;
        setRows((res.items as LeadRow[]).map(normalizeRow));
        setCursor(res.nextCursor);
        setSelected(new Set());
        setLoadError(null);
        setDenied(false);
      } catch (error) {
        if (id !== requestId.current && !isNextRedirect(error)) return;
        handleLoadFailure(error);
      }
    });
  };

  const onSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => applyFilters(v, status), 350);
  };

  const onStatusFilter = (s: string) => {
    setStatus(s);
    applyFilters(search, s);
  };

  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearch("");
    setStatus("");
    applyFilters("", "");
  };

  const loadMore = () =>
    startList(async () => {
      if (!cursor) return;
      const id = requestId.current;
      try {
        const res = await fetchLeadsPage({
          listId,
          search: search || undefined,
          status: status || undefined,
          cursor,
          pageSize: PAGE_SIZE,
        });
        if (id !== requestId.current) return;
        setRows((r) => [...r, ...(res.items as LeadRow[]).map(normalizeRow)]);
        setCursor(res.nextCursor);
        setLoadError(null);
      } catch (error) {
        if (id !== requestId.current && !isNextRedirect(error)) return;
        handleLoadFailure(error);
      }
    });

  const openCreate = () => setEditor({ mode: "create", lead: null, nonce: Date.now() });
  const openEdit = (lead: LeadRow) => setEditor({ mode: "edit", lead, nonce: Date.now() });

  const onSaved = (row: LeadFormLead) => {
    const next = normalizeRow(row);
    setRows((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [{ ...next, createdAt: next.createdAt ?? new Date().toISOString() }, ...current];
      return current.map((item) =>
        item.id === next.id ? { ...item, ...next, status: item.status, tags: item.tags } : item,
      );
    });
    setEditor(null);
    router.refresh();
  };

  const changeStatus = (leadId: string, next: string) => {
    start(async () => {
      const res = await updateLeadStatus({ leadId, status: next });
      if (!res.ok || !res.data) {
        toast.error(res.ok ? "Could not update status" : res.error);
        return;
      }
      const saved = res.data.status;
      setRows((prev) => {
        const updated = prev.map((row) => (row.id === leadId ? { ...row, status: saved } : row));
        if (status && saved !== status) return updated.filter((row) => row.id !== leadId);
        return updated;
      });
      setSelected((prev) => {
        if (!status || saved === status || !prev.has(leadId)) return prev;
        const nextSelected = new Set(prev);
        nextSelected.delete(leadId);
        return nextSelected;
      });
      toast.success(res.message ?? "Status updated");
    });
  };

  const toggleAll = (checked: boolean) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());

  const toggleOne = (id: string, checked: boolean) =>
    setSelected((p) => {
      const n = new Set(p);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });

  const askBulkDelete = () => {
    const leads = rows.filter((row) => selected.has(row.id)).map((row) => ({ id: row.id, email: row.email }));
    if (!leads.length) return;
    setDeleteRequest({ mode: "bulk", leads });
  };

  const onDeleted = (ids: string[]) => {
    const removed = new Set(ids);
    setRows((current) => current.filter((row) => !removed.has(row.id)));
    setSelected(new Set());
    toast.success(ids.length === 1 ? "Lead deleted" : `Deleted ${ids.length.toLocaleString()} leads`);
    router.refresh();
  };

  const doExport = () => {
    const picked = rows.filter((r) => selected.size === 0 || selected.has(r.id));
    if (picked.length === 0) {
      toast.error("There are no leads to export");
      return;
    }
    downloadLeadsCsv(picked, `${fileSlug(title)}-leads.csv`);
    const noun = picked.length === 1 ? "lead" : "leads";
    if (selected.size === 0 && cursor) {
      toast.success(`Exported the ${picked.length.toLocaleString()} ${noun} loaded so far`, {
        description: "Load more rows first to include the rest of the list.",
      });
    } else {
      toast.success(`Exported ${picked.length.toLocaleString()} ${noun}`);
    }
  };

  const doTag = (tagId: string, mode: "add" | "remove") => {
    const ids = [...selected];
    if (ids.length === 0) return;
    start(async () => {
      const res = await bulkTagLeads(ids, tagId, mode);
      if (res.ok) {
        const tagName = tagById[tagId]?.name;
        toast.success(
          tagName
            ? `${mode === "add" ? "Added" : "Removed"} "${tagName}" ${mode === "add" ? "to" : "from"} ${ids.length.toLocaleString()} ${ids.length === 1 ? "lead" : "leads"}`
            : "Tags updated",
        );
        applyFilters(search, status);
      } else toast.error(res.error);
    });
  };

  const onTagCreated = (tag: TagOpt) => {
    setTagList((t) => [...t, tag]);
    if (selected.size > 0) {
      const ids = [...selected];
      start(async () => {
        const res = await bulkTagLeads(ids, tag.id, "add");
        if (res.ok) applyFilters(search, status);
        else toast.error(res.error);
      });
    }
  };

  const filtered = Boolean(search || status);
  const exactTotal = totalCount ?? rows.length;
  const isEmptyList = rows.length === 0 && !filtered && !loadError && !cursor && !listPending;
  const importHref = `/leads/import?listId=${listId}`;

  const description = `${exactTotal.toLocaleString()} ${exactTotal === 1 ? "lead" : "leads"} in this list.`;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/campaigns" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Campaigns & leads
          </Link>
        }
        title={title}
        description={description}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More list actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                  <Pencil />
                  Rename list
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onSelect={() => setDeleteListOpen(true)}>
                  <Trash2 />
                  Delete list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={openCreate}>
              <Plus />
              Add lead
            </Button>
            <Button asChild>
              <Link href={importHref}>
                <Upload />
                Import CSV
              </Link>
            </Button>
          </>
        }
      />

      {denied ? (
        <PermissionDenied />
      ) : isEmptyList ? (
        <EmptyState
          icon={UserPlus}
          title="This list is empty"
          description="Import a CSV to add many contacts at once, or add a single lead by hand."
          action={
            <>
              <Button asChild size="sm">
                <Link href={importHref}>
                  <Upload />
                  Import CSV
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={openCreate}>
                <Plus />
                Add lead
              </Button>
            </>
          }
        />
      ) : (
        <section aria-label="Leads" className="flex flex-col gap-4">
          <LeadToolbar
            search={search}
            status={status}
            filtered={filtered}
            loading={listPending}
            selectedCount={selected.size}
            onSearch={onSearch}
            onStatus={onStatusFilter}
            onClearFilters={clearFilters}
            onExport={doExport}
          />

          {loadError && rows.length > 0 ? (
            <Alert
              variant="destructive"
              action={
                <Button variant="outline" size="xs" onClick={() => applyFilters(search, status)}>
                  Try again
                </Button>
              }
            >
              <AlertDescription className="mt-0 text-foreground">Could not load leads. {loadError}</AlertDescription>
            </Alert>
          ) : null}

          {loadError && rows.length === 0 ? (
            <ErrorState
              title="Could not load leads"
              description={loadError}
              onRetry={() => applyFilters(search, status)}
            />
          ) : (
            <LeadRowsTable
              rows={rows}
              selected={selected}
              tagById={tagById}
              loading={listPending}
              statusDisabled={pending}
              filtered={filtered}
              onToggleAll={toggleAll}
              onToggleOne={toggleOne}
              onEdit={openEdit}
              onDelete={(row) => setDeleteRequest({ mode: "one", leads: [{ id: row.id, email: row.email }] })}
              onStatusChange={changeStatus}
              onClearFilters={clearFilters}
            />
          )}

          <BulkActionBar
            selectedCount={selected.size}
            busy={pending}
            tags={tagList}
            onClearSelection={() => setSelected(new Set())}
            onExport={doExport}
            onTag={doTag}
            onNewTag={() => setNewTagOpen(true)}
            onDelete={askBulkDelete}
          />

          {rows.length > 0 ? (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="tabular text-xs text-subtle-foreground" aria-live="polite">
                {filtered
                  ? `Showing ${rows.length.toLocaleString()}${cursor ? "+" : ""} matching ${rows.length === 1 && !cursor ? "lead" : "leads"}`
                  : `Showing ${rows.length.toLocaleString()} of ${Math.max(exactTotal, rows.length).toLocaleString()}`}
              </p>
              {cursor && !(loadError && rows.length === 0) ? (
                <Button variant="outline" size="sm" onClick={loadMore} loading={listPending}>
                  Load more
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      {editor ? (
        <LeadFormDialog
          key={editor.nonce}
          open
          mode={editor.mode}
          listId={listId}
          lead={editor.lead}
          onOpenChange={(next) => {
            if (!next) setEditor(null);
          }}
          onSaved={onSaved}
        />
      ) : null}

      {renameOpen ? (
        <RenameListDialog
          key={title}
          open
          listId={listId}
          name={title}
          onOpenChange={setRenameOpen}
          onRenamed={(next) => {
            setTitle(next);
            toast.success("List renamed");
            router.refresh();
          }}
        />
      ) : null}

      {deleteListOpen ? (
        <DeleteListDialog
          open
          listId={listId}
          name={title}
          leadCount={totalCount}
          onOpenChange={setDeleteListOpen}
          onDeleted={() => {
            toast.success(`Deleted "${title}"`);
            router.push("/campaigns");
            router.refresh();
          }}
        />
      ) : null}

      {deleteRequest ? (
        <DeleteLeadsDialog
          open
          mode={deleteRequest.mode}
          leads={deleteRequest.leads}
          onOpenChange={(next) => {
            if (!next) setDeleteRequest(null);
          }}
          onDeleted={onDeleted}
        />
      ) : null}

      {newTagOpen ? (
        <NewTagDialog
          open
          selectedCount={selected.size}
          onOpenChange={setNewTagOpen}
          onCreated={onTagCreated}
        />
      ) : null}
    </>
  );
}

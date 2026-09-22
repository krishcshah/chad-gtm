"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Plus, Search, Tag, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { LEAD_STATUSES } from "@smartreach/shared";
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  PermissionDenied,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@smartreach/ui";
import { bulkTagLeads, createLeadTag, fetchLeadsPage, updateLeadStatus } from "@/lib/actions";
import { asCustomFields, isNextRedirect, isPermissionError } from "@/lib/lead-form";
import { LeadFormDialog, type LeadFormLead } from "./lead-form-dialog";
import { DeleteLeadsDialog, DeleteListDialog, RenameListDialog } from "./lead-manage-dialogs";

export interface LeadRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  tags: string[] | null;
  customFields?: Record<string, string> | null;
}

function normalizeRow(row: LeadRow): LeadRow {
  return { ...row, customFields: asCustomFields(row.customFields) };
}

interface TagOpt { id: string; name: string; color: string }

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
  const [deleteRequest, setDeleteRequest] = useState<{ mode: "one" | "bulk"; leads: { id: string; email: string }[] } | null>(null);
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

  const tagById = useMemo(() => Object.fromEntries(tagList.map((t) => [t.id, t])), [tagList]);

  const writeFilterUrl = (q: string, s: string) => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (s) params.set("status", s);
    const qs = params.toString();
    router.replace(qs ? `/leads/${listId}?${qs}` : `/leads/${listId}`, { scroll: false });
  };

  const applyFilters = (q: string, s: string) => {
    const id = ++requestId.current;
    writeFilterUrl(q, s);
    startList(async () => {
      try {
        const res = await fetchLeadsPage({ listId, search: q || undefined, status: s || undefined, pageSize: 50 });
        if (id !== requestId.current) return;
        setRows((res.items as LeadRow[]).map(normalizeRow));
        setCursor(res.nextCursor);
        setSelected(new Set());
        setLoadError(null);
        setDenied(false);
      } catch (error) {
        if (isNextRedirect(error)) throw error;
        if (id !== requestId.current) return;
        const message = error instanceof Error ? error.message : "Could not load leads";
        if (isPermissionError(message)) setDenied(true);
        else setLoadError(message);
      }
    });
  };

  const onSearch = (v: string) => {
    setSearch(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => applyFilters(v, status), 350);
  };

  const loadMore = () =>
    startList(async () => {
      if (!cursor) return;
      const id = requestId.current;
      try {
        const res = await fetchLeadsPage({ listId, search: search || undefined, status: status || undefined, cursor, pageSize: 50 });
        if (id !== requestId.current) return;
        setRows((r) => [...r, ...(res.items as LeadRow[]).map(normalizeRow)]);
        setCursor(res.nextCursor);
        setLoadError(null);
      } catch (error) {
        if (isNextRedirect(error)) throw error;
        if (id !== requestId.current) return;
        const message = error instanceof Error ? error.message : "Could not load leads";
        if (isPermissionError(message)) setDenied(true);
        else setLoadError(message);
      }
    });

  const openCreate = () => setEditor({ mode: "create", lead: null, nonce: Date.now() });
  const openEdit = (lead: LeadRow) => setEditor({ mode: "edit", lead, nonce: Date.now() });

  const onSaved = (row: LeadFormLead) => {
    const next = normalizeRow(row);
    setRows((current) => {
      const index = current.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...current];
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

  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());

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
    toast.success(ids.length === 1 ? "Lead deleted" : `Deleted ${ids.length} leads`);
    router.refresh();
  };

  const doExport = () => {
    const header = "email,first_name,last_name,company,status\n";
    const body = rows
      .filter((r) => selected.size === 0 || selected.has(r.id))
      .map((r) =>
        [r.email, r.firstName ?? "", r.lastName ?? "", r.company ?? "", r.status]
          .map((v) => (String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : v))
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const doTag = (tagId: string, mode: "add" | "remove") =>
    start(async () => {
      const res = await bulkTagLeads([...selected], tagId, mode);
      if (res.ok) {
        toast.success("Tags updated");
        applyFilters(search, status);
      } else toast.error(res.error);
    });

  const newTag = () => {
    const name = window.prompt("New tag name");
    if (!name?.trim()) return;
    start(async () => {
      const res = await createLeadTag({ name: name.trim() });
      if (res.ok && res.data) {
        setTagList((t) => [...t, { id: res.data!.id, name: name.trim(), color: "#6366f1" }]);
        toast.success(`Tag "${name.trim()}" created`);
      } else if (!res.ok) toast.error(res.error);
    });
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const filtered = Boolean(search || status);
  const countLabel = `${rows.length}${cursor ? "+" : ""}`;
  const exactTotal = totalCount ?? rows.length;

  return (
    <div className="page-stack">
      <PageHeader
        title={title}
        description={
          filtered
            ? `${countLabel} matching ${rows.length === 1 ? "lead" : "leads"} for email, name, or company.`
            : `${exactTotal.toLocaleString()} ${exactTotal === 1 ? "lead" : "leads"} in this list.`
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(true)}>
              Rename
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteListOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-1.5" /> Delete List
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Lead
            </Button>
          </>
        }
      />

      {denied ? (
        <PermissionDenied />
      ) : (
      <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search email, name, company…"
            className="w-full pl-9" type="search" aria-label="Search leads by email, name, or company" />
        </div>
        <div className="w-full sm:w-40">
        <Select value={status || "all"} onValueChange={(v) => { const s = v === "all" ? "" : v; setStatus(s); applyFilters(search, s); }}>
          <SelectTrigger className="w-full" aria-label="Filter by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {selected.size > 0 && (
            <span className="text-sm text-muted-foreground">{selected.size} selected</span>
          )}
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setStatus("");
                applyFilters("", "");
              }}
            >
              Clear
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={doExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {selected.size > 0 && (
            <>
              <TagDropdown tags={tagList} onTag={doTag} onNew={newTag} />
              <Button variant="destructive" size="sm" onClick={askBulkDelete} disabled={pending}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {listPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          Loading leads…
        </p>
      ) : null}

      {loadError ? (
        <ErrorState
          title="Could not load leads"
          description={loadError}
          onRetry={() => applyFilters(search, status)}
        />
      ) : null}

      {rows.length === 0 && !filtered && !loadError ? (
        <EmptyState
          icon={UserPlus}
          title="No leads in this list"
          description="Add a lead by email, or upload a CSV from the Leads page."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Lead
            </Button>
          }
        />
      ) : rows.length > 0 || filtered ? (
      <div className={cn("overflow-x-auto rounded-xl border", listPending && "opacity-60")} aria-busy={listPending}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(!!v)} />
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="w-[1%]"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                  No leads match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, !!v)} />
                  </TableCell>
                  <TableCell className="font-medium">{r.email}</TableCell>
                  <TableCell>{[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.company ?? "—"}</TableCell>
                  <TableCell>
                    <LeadStatusSelect
                      status={r.status}
                      email={r.email}
                      disabled={pending}
                      onChange={(next) => changeStatus(r.id, next)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(r.tags ?? []).map((tId) => {
                        const t = tagById[tId];
                        if (!t) return null;
                        return (
                          <span key={tId} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                            style={{ backgroundColor: `${t.color}22`, color: t.color }}>
                            {t.name}
                          </span>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(r)}
                        aria-label={`Edit Lead ${r.email}`}
                      >
                        Edit Lead
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteRequest({ mode: "one", leads: [{ id: r.id, email: r.email }] })}
                        aria-label={`Delete lead ${r.email}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      ) : null}

      {cursor && !loadError && (rows.length > 0 || filtered) && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={listPending}>
            {listPending ? "Loading leads…" : "Load more"}
          </Button>
        </div>
      )}
      </>
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
          onOpenChange={setDeleteListOpen}
          onDeleted={() => {
            toast.success("List deleted");
            router.push("/leads");
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
    </div>
  );
}

function LeadStatusSelect({
  status,
  email,
  disabled,
  onChange,
}: {
  status: string;
  email: string;
  disabled: boolean;
  onChange: (status: string) => void;
}) {
  const known = (LEAD_STATUSES as readonly string[]).includes(status);
  return (
    <Select value={status} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-8 w-[9.5rem]" aria-label={`Status for ${email}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!known && status ? <SelectItem value={status}>{status}</SelectItem> : null}
        {LEAD_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TagDropdown({ tags, onTag, onNew }: { tags: TagOpt[]; onTag: (id: string, m: "add" | "remove") => void; onNew: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
        <Tag className="h-4 w-4" /> Tag <ChevronDown className="h-3 w-3 opacity-60" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border bg-popover p-1 shadow-xl">
            {tags.length === 0 && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No tags yet</p>}
            {tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-1 px-1">
                <span className="flex items-center gap-2 px-1 py-1.5 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  {t.name}
                </span>
                <div className="flex gap-0.5">
                  <button onClick={() => { onTag(t.id, "add"); setOpen(false); }} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">+</button>
                  <button onClick={() => { onTag(t.id, "remove"); setOpen(false); }} className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            <div className="my-1 border-t" />
            <button onClick={() => { onNew(); setOpen(false); }} className="w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              + New tag
            </button>
          </div>
        </>
      )}
    </div>
  );
}

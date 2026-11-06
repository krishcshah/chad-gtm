"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, MoreHorizontal, Pencil, Plus, Search, SearchX, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@smartreach/shared";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import { DeleteListDialog, RenameListDialog } from "./[id]/lead-manage-dialogs";

export interface LeadListSummary {
  id: string;
  name: string;
  leadCount: number;
  createdAt: string | null;
}

/** Show the search box once there are enough lists to need it. */
const SEARCH_THRESHOLD = 6;

export function LeadListsView({ lists: initialLists }: { lists: LeadListSummary[] }) {
  const router = useRouter();
  const [lists, setLists] = useState(initialLists);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<LeadListSummary | null>(null);
  const [deleting, setDeleting] = useState<LeadListSummary | null>(null);

  useEffect(() => setLists(initialLists), [initialLists]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? lists.filter((l) => l.name.toLowerCase().includes(q)) : lists;
  }, [lists, query]);

  const totalLeads = lists.reduce((sum, l) => sum + l.leadCount, 0);

  if (lists.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No lead lists yet"
        description="Import a CSV of contacts and AutoGTM creates the list for you. You can also start with an empty list."
        action={
          <>
            <Button asChild size="sm">
              <Link href="/leads/import">
                <Upload />
                Import CSV
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/leads/new">
                <Plus />
                New list
              </Link>
            </Button>
          </>
        }
      />
    );
  }

  return (
    <section aria-label="Lead lists" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="tabular text-[13px] text-muted-foreground">
          {lists.length.toLocaleString()} {lists.length === 1 ? "list" : "lists"} ·{" "}
          {totalLeads.toLocaleString()} {totalLeads === 1 ? "lead" : "leads"}
        </p>
        {lists.length > SEARCH_THRESHOLD ? (
          <div className="relative w-full sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search lists"
              aria-label="Search lead lists by name"
              className="pl-9"
            />
          </div>
        ) : null}
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <EmptyState
                    compact
                    icon={SearchX}
                    title="No lists match"
                    description={`Nothing is called “${query.trim()}”.`}
                    action={
                      <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              visible.map((list) => (
                <TableRow key={list.id}>
                  <TableCell className="w-full max-w-0 py-2.5">
                    <Link
                      href={`/leads/${list.id}`}
                      className="block truncate rounded-sm font-medium text-foreground outline-none hover:underline hover:decoration-border-strong hover:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring"
                    >
                      {list.name}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap py-2.5 text-right">
                    {list.leadCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap py-2.5 text-muted-foreground sm:table-cell">
                    {/* Server and browser time zones can differ by a day. */}
                    <time dateTime={list.createdAt ?? undefined} suppressHydrationWarning>
                      {formatDate(list.createdAt)}
                    </time>
                  </TableCell>
                  <TableCell className="py-1.5 text-right">
                    <ListActions
                      list={list}
                      onRename={() => setRenaming(list)}
                      onDelete={() => setDeleting(list)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {renaming ? (
        <RenameListDialog
          open
          listId={renaming.id}
          name={renaming.name}
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
          onRenamed={(name) => {
            const id = renaming.id;
            setLists((current) => current.map((l) => (l.id === id ? { ...l, name } : l)));
            toast.success("List renamed");
            router.refresh();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteListDialog
          open
          listId={deleting.id}
          name={deleting.name}
          leadCount={deleting.leadCount}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
          onDeleted={() => {
            const { id, name } = deleting;
            setLists((current) => current.filter((l) => l.id !== id));
            toast.success(`Deleted "${name}"`);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function ListActions({
  list,
  onRename,
  onDelete,
}: {
  list: LeadListSummary;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${list.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/leads/import?listId=${list.id}`}>
            <Upload />
            Import CSV into list
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRename}>
          <Pencil />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onDelete}>
          <Trash2 />
          Delete list
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

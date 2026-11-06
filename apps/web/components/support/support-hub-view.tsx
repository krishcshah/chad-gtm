"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LifeBuoy, MessageSquare, Plus, Search, ShieldCheck } from "lucide-react";
import { timeAgo } from "@smartreach/shared";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  NativeSelect,
  PageHeader,
  SegmentedControl,
} from "@smartreach/ui";
import { Page } from "@/components/layout/page";
import { TICKET_CATEGORIES, type SupportTicketDTO, type TicketCategory, type TicketStatus } from "@/lib/support-types";
import { TICKET_CATEGORY_META, TicketCategoryBadge } from "./ticket-category-badge";
import { TICKET_STATUS_META, TicketStatusBadge } from "./ticket-status-badge";
import { TicketCreateForm } from "./ticket-create-form";

type StatusFilter = "all" | TicketStatus;
const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

export function SupportHubView({
  tickets,
  isAdminUser,
  userEmail,
  initialCreateCategory = null,
}: {
  tickets: SupportTicketDTO[];
  isAdminUser: boolean;
  userEmail: string;
  /** Opens the new-ticket dialog on load with this category (from /bug-report or ?new=). */
  initialCreateCategory?: TicketCategory | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(initialCreateCategory !== null);
  const [createCategory, setCreateCategory] = useState<TicketCategory>(initialCreateCategory ?? "bug_report");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<"all" | TicketCategory>("all");

  // A client-side visit to /support?new=… (e.g. via /bug-report) while this view is
  // already mounted keeps state, so open the dialog when the requested category arrives.
  useEffect(() => {
    if (initialCreateCategory) {
      setCreateCategory(initialCreateCategory);
      setCreateOpen(true);
    }
  }, [initialCreateCategory]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: tickets.length, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const t of tickets) if (t.status in c) c[t.status] += 1;
    return c;
  }, [tickets]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (category !== "all" && t.category !== category) return false;
      if (!q) return true;
      return (
        t.heading.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.userEmail.toLowerCase().includes(q)
      );
    });
  }, [tickets, status, category, search]);

  const filtered = search.trim() !== "" || status !== "all" || category !== "all";

  function openCreate(next: TicketCategory = "bug_report") {
    setCreateCategory(next);
    setCreateOpen(true);
  }

  function onCreateOpenChange(open: boolean) {
    setCreateOpen(open);
    // Drop ?new=… so a refresh does not reopen the dialog.
    if (!open && initialCreateCategory) router.replace(pathname);
  }

  function clearFilters() {
    setSearch("");
    setStatus("all");
    setCategory("all");
  }

  return (
    <Page>
      <PageHeader
        title="Support"
        description={
          isAdminUser
            ? "Every ticket from every account. Reply in the thread and set the status when it is handled."
            : "Report a problem, ask a question or suggest an improvement. Our replies appear in the ticket."
        }
        actions={
          <>
            {isAdminUser ? (
              <Button asChild variant="outline">
                <Link href="/admin">
                  <ShieldCheck /> Admin
                </Link>
              </Button>
            ) : null}
            {tickets.length > 0 ? (
              <Button onClick={() => openCreate()}>
                <Plus /> New ticket
              </Button>
            ) : null}
          </>
        }
      />

      {tickets.length === 0 ? (
        <EmptyState
          icon={LifeBuoy}
          title="No tickets yet"
          description="Open a ticket when something breaks or you have a question. You can follow every reply here."
          action={
            <Button onClick={() => openCreate()}>
              <Plus /> New ticket
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAdminUser ? "Search subject, details or email" : "Search your tickets"}
                aria-label="Search tickets"
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <SegmentedControl<StatusFilter>
                  aria-label="Filter by status"
                  value={status}
                  onValueChange={setStatus}
                  options={[
                    { value: "all", label: <FilterLabel label="All" count={counts.all} /> },
                    ...STATUS_ORDER.map((s) => ({
                      value: s,
                      label: <FilterLabel label={TICKET_STATUS_META[s].label} count={counts[s]} />,
                    })),
                  ]}
                />
              </div>
              <NativeSelect
                aria-label="Filter by category"
                value={category}
                onChange={(e) => setCategory(e.target.value as "all" | TicketCategory)}
                className="sm:w-44"
              >
                <option value="all">All categories</option>
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {TICKET_CATEGORY_META[c.id].label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {visible.length === 1 ? "1 ticket" : `${visible.length} tickets`}
          </p>

          {visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching tickets"
              description="Nothing matches this search and these filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-border">
                {visible.map((t) => (
                  <TicketRow key={t.id} ticket={t} showAuthor={isAdminUser || t.userEmail !== userEmail} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New ticket</DialogTitle>
            <DialogDescription>
              The more detail you give, the faster we can help. Your account and workspace are attached automatically.
            </DialogDescription>
          </DialogHeader>
          <TicketCreateForm
            key={createCategory}
            defaultCategory={createCategory}
            onSuccess={() => setCreateOpen(false)}
            onCancel={() => onCreateOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}

function FilterLabel({ label, count }: { label: string; count: number }) {
  return (
    <>
      {label}
      <span className="tabular text-subtle-foreground">{count.toLocaleString()}</span>
    </>
  );
}

function TicketRow({ ticket: t, showAuthor }: { ticket: SupportTicketDTO; showAuthor: boolean }) {
  const messages = t.messageCount || 1;
  return (
    <li>
      <Link
        href={`/support/${t.id}`}
        className="flex flex-col gap-2 px-5 py-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 sm:flex-row sm:items-start sm:gap-6"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{t.heading}</p>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">{t.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-subtle-foreground">
            <TicketCategoryBadge category={t.category} />
            {showAuthor ? <span className="truncate">{t.userEmail}</span> : null}
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden />
              <span className="tabular">{messages.toLocaleString()}</span>
              <span className="sr-only">{messages === 1 ? "message" : "messages"}</span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <TicketStatusBadge status={t.status} />
          <time dateTime={t.updatedAt} className="text-xs text-subtle-foreground" suppressHydrationWarning>
            Updated {timeAgo(t.updatedAt)}
          </time>
        </div>
      </Link>
    </li>
  );
}

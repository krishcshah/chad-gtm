"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Mail, Plus, Search, SearchX, Upload } from "lucide-react";
import { Button, Card, EmptyState, Input, PageHeader, SegmentedControl, Stat } from "@smartreach/ui";
import { Page } from "@/components/layout/page";
import { BulkEditDialog } from "./bulk-edit-dialog";
import { SenderDetailDrawer } from "./sender-detail-drawer";
import { SendersTable } from "./senders-table";
import { needsAttention, type SenderRow } from "./sender-types";

type Filter = "all" | "active" | "paused" | "attention";

export function SendersClient({ senders }: { senders: SenderRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: senders.length,
      active: senders.filter((s) => s.status === "active").length,
      paused: senders.filter((s) => s.status === "paused").length,
      attention: senders.filter(needsAttention).length,
    }),
    [senders],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return senders.filter((s) => {
      if (filter === "active" && s.status !== "active") return false;
      if (filter === "paused" && s.status !== "paused") return false;
      if (filter === "attention" && !needsAttention(s)) return false;
      if (!q) return true;
      return s.email.toLowerCase().includes(q) || s.senderName.toLowerCase().includes(q);
    });
  }, [senders, query, filter]);

  // Drop selections for mailboxes that no longer exist (deleted elsewhere, refreshed).
  const liveSelected = selectedIds.filter((id) => senders.some((s) => s.id === id));
  const openSender = openId ? (senders.find((s) => s.id === openId) ?? null) : null;

  const sentToday = senders.reduce((n, s) => n + s.usedToday, 0);
  const capacity = senders.filter((s) => s.status === "active").reduce((n, s) => n + s.dailyLimit, 0);
  const replies = senders.reduce((n, s) => n + s.repliedCount, 0);

  return (
    <Page>
      <PageHeader
        title="Mailboxes"
        description="The email accounts your campaigns send from. Sending rotates across every active mailbox and stays under each one's daily limit."
        // With no mailboxes the empty state carries these actions; one primary per view.
        actions={
          senders.length === 0 ? undefined : (
            <>
              <Button asChild variant="outline">
                <Link href="/senders/import">
                  <Upload />
                  Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href="/senders/new">
                  <Plus />
                  Connect mailbox
                </Link>
              </Button>
            </>
          )
        }
      />

      {senders.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="No mailboxes yet"
          description="Connect a mailbox with its SMTP login, or import several at once from a CSV file. Campaigns can't send until at least one mailbox is active."
          action={
            <>
              <Button asChild size="sm">
                <Link href="/senders/new">
                  <Plus />
                  Connect mailbox
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/senders/import">
                  <Upload />
                  Import CSV
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <a href="/api/senders/template" download>
                  <Download />
                  CSV template
                </a>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
            <Stat
              bare
              label="Active"
              value={counts.active.toLocaleString()}
              hint={`of ${counts.all.toLocaleString()} connected`}
            />
            <Stat
              bare
              label="Sent today"
              value={sentToday.toLocaleString()}
              hint={capacity > 0 ? `of ${capacity.toLocaleString()} daily capacity` : "No active mailboxes"}
            />
            <Stat bare label="Replies" value={replies.toLocaleString()} hint="Received across all mailboxes" />
            <Stat
              bare
              label="Need attention"
              value={counts.attention.toLocaleString()}
              hint={counts.attention > 0 ? "Failed their connection test" : "No failed connections"}
            />
          </Card>

          <section aria-label="Mailbox list" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative sm:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
                  aria-hidden
                />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or email"
                  aria-label="Search mailboxes"
                  className="pl-9"
                />
              </div>
              <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                <SegmentedControl
                  aria-label="Filter mailboxes"
                  value={filter}
                  onValueChange={setFilter}
                  options={[
                    { value: "all", label: `All ${counts.all}` },
                    { value: "active", label: `Active ${counts.active}` },
                    { value: "paused", label: `Paused ${counts.paused}` },
                    {
                      value: "attention",
                      label: `Need attention ${counts.attention}`,
                    },
                  ]}
                />
              </div>
            </div>

            {liveSelected.length > 0 && (
              <div
                role="region"
                aria-label="Selection"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/60 px-4 py-2.5"
              >
                <p className="text-[13px]">
                  <span className="tabular font-medium">{liveSelected.length}</span>{" "}
                  <span className="text-muted-foreground">
                    {liveSelected.length === 1 ? "mailbox" : "mailboxes"} selected
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>
                    Clear
                  </Button>
                  <Button size="sm" onClick={() => setBulkOpen(true)}>
                    Edit selected
                  </Button>
                </div>
              </div>
            )}

            {visible.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No mailboxes match"
                description="Try a different search or filter."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <SendersTable
                senders={visible}
                selectedIds={liveSelected}
                onSelectedChange={setSelectedIds}
                onOpen={setOpenId}
              />
            )}
          </section>
        </>
      )}

      <SenderDetailDrawer
        sender={openSender}
        open={openSender !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      />

      <BulkEditDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        selectedIds={liveSelected}
        onSuccess={() => setSelectedIds([])}
      />
    </Page>
  );
}

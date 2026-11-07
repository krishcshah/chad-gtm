"use client";

import { useMemo, useRef, useState } from "react";
import { Archive, Download, Mail, Pause, Play, Search, SearchX, Upload } from "lucide-react";
import { timeAgo } from "@smartreach/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Progress,
  SegmentedControl,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  statusVariant,
  toast,
} from "@smartreach/ui";
import { parseCsvText } from "@/lib/csv";
import {
  getSystemMailboxPoolStats,
  importSystemMailboxesCsv,
  retireSystemMailbox,
  takeOverMailboxPoolAction,
  toggleSystemMailboxStatus,
  type SystemMailboxPoolStats,
} from "@/lib/admin-gtm-actions";
import { AdminPoolCustomers } from "./admin-pool-customers";
import { AdminUnmatchedInbound } from "./admin-unmatched-inbound";

type Mailbox = SystemMailboxPoolStats["mailboxes"][number];
type StatusFilter = "all" | "active" | "paused" | "failed";

function withCount(label: string, count: number) {
  return (
    <>
      {label}
      <span className="tabular text-subtle-foreground">{count.toLocaleString()}</span>
    </>
  );
}

/** CSV header (lower-cased) to import field. Matches public/example_senders.csv. */
const HEADER_MAP: Record<string, string> = {
  "sender name": "senderName",
  email: "email",
  "smtp host": "smtpHost",
  "smtp port": "smtpPort",
  "smtp username": "smtpUsername",
  "smtp password": "smtpPassword",
  "smtp security": "smtpSecurity",
  "imap host": "imapHost",
  "imap port": "imapPort",
  "imap username": "imapUsername",
  "imap password": "imapPassword",
  "daily limit": "dailyLimit",
  "hourly limit": "hourlyLimit",
  timezone: "timezone",
  signature: "signature",
};

/** Daily demand as a share of today's real capacity (warm-up included), bucketed by the server. */
const UTILIZATION = {
  green: { short: "Healthy", label: "Demand is under 80% of today's capacity", tone: "success" as const },
  yellow: { short: "Near capacity", label: "80–100% of capacity", tone: "neutral" as const },
  red: {
    short: "Over capacity",
    label: "Over capacity: customers get less than they asked for",
    tone: "destructive" as const,
  },
};

function connectionVariant(status: string) {
  if (status === "ok") return "success" as const;
  if (status === "failed") return "destructive" as const;
  return "neutral" as const;
}

/** Shared sending pool: capacity, the mailbox table, pause/resume and CSV import. */
export function AdminMailboxPoolView({ initialStats }: { initialStats: SystemMailboxPoolStats }) {
  const [stats, setStats] = useState<SystemMailboxPoolStats>(initialStats);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [retireTarget, setRetireTarget] = useState<Mailbox | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const util = UTILIZATION[stats.utilizationStatus] ?? UTILIZATION.green;

  const counts = useMemo(() => {
    const c = { all: stats.mailboxes.length, active: 0, paused: 0, failed: 0 };
    for (const m of stats.mailboxes) {
      if (m.status === "active") c.active++;
      else if (m.status === "paused") c.paused++;
      else if (m.status === "failed") c.failed++;
    }
    return c;
  }, [stats.mailboxes]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.mailboxes.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      return m.email.toLowerCase().includes(q) || m.senderName.toLowerCase().includes(q);
    });
  }, [stats.mailboxes, search, statusFilter]);

  const refreshStats = async () => {
    try {
      setStats(await getSystemMailboxPoolStats());
    } catch {
      // Keep the current numbers; a reload will pick up the import.
    }
  };

  const poolMailboxTotal = stats.poolOwners.reduce((n, o) => n + o.count, 0);

  const handleTakeOver = async () => {
    setTakingOver(true);
    try {
      const res = await takeOverMailboxPoolAction();
      if (res.ok) {
        toast.success(
          res.moved
            ? `You now own the shared pool (${res.moved.toLocaleString()} ${res.moved === 1 ? "mailbox" : "mailboxes"} moved).`
            : "You already own the shared pool.",
        );
        setTakeOverOpen(false);
        await refreshStats();
      } else {
        toast.error(res.error || "The pool could not be taken over.");
      }
    } catch {
      toast.error("The pool could not be taken over. Try again.");
    } finally {
      setTakingOver(false);
    }
  };

  const handleRetire = async () => {
    if (!retireTarget) return;
    const mailbox = retireTarget;
    setRetiring(true);
    try {
      const res = await retireSystemMailbox(mailbox.id);
      if (res.ok) {
        toast.success(`${mailbox.email} is retired.`);
        setRetireTarget(null);
        setStats((prev) => ({ ...prev, mailboxes: prev.mailboxes.filter((m) => m.id !== mailbox.id) }));
        await refreshStats();
      } else {
        toast.error(res.error || "Could not retire the mailbox.");
      }
    } catch {
      toast.error("Could not retire the mailbox. Try again.");
    } finally {
      setRetiring(false);
    }
  };

  const handleToggle = async (mailbox: Mailbox) => {
    const nextStatus = mailbox.status === "active" ? "paused" : "active";
    setBusyId(mailbox.id);
    try {
      const res = await toggleSystemMailboxStatus(mailbox.id, nextStatus);
      if (res.ok) {
        toast.success(nextStatus === "active" ? `${mailbox.email} is active again.` : `${mailbox.email} is paused.`);
        // Adjust counts from the mailbox's previous status: resuming a failed
        // mailbox must not lower the paused count.
        const was = mailbox.status;
        setStats((prev) => ({
          ...prev,
          mailboxes: prev.mailboxes.map((m) => (m.id === mailbox.id ? { ...m, status: nextStatus } : m)),
          activeMailboxes: Math.max(
            0,
            prev.activeMailboxes + (nextStatus === "active" ? 1 : 0) - (was === "active" ? 1 : 0),
          ),
          pausedMailboxes: Math.max(
            0,
            prev.pausedMailboxes + (nextStatus === "paused" ? 1 : 0) - (was === "paused" ? 1 : 0),
          ),
        }));
        // Activation re-tests SMTP and IMAP; pull the fresh connection status and capacity numbers.
        if (nextStatus === "active") void refreshStats();
      } else {
        toast.error(res.error || "Could not update the mailbox.");
        // A failed activation test marks the mailbox failed; show that.
        if (nextStatus === "active") {
          setStats((prev) => ({
            ...prev,
            mailboxes: prev.mailboxes.map((m) => (m.id === mailbox.id ? { ...m, status: "failed" } : m)),
          }));
        }
      }
    } catch {
      toast.error("Could not update the mailbox. Try again.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Shared mailboxes that approved accounts send from. The target is {stats.targetPacePerMailbox} emails a day
            per mailbox, which keeps domain reputation safe.
          </p>
          {stats.poolOwners.length > 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Pool owner:{" "}
              <span className="font-medium text-foreground">
                {stats.poolOwners.map((o) => o.email).join(", ")}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!stats.ownedByMe ? (
            <Button variant="outline" onClick={() => setTakeOverOpen(true)}>
              Take over the pool
            </Button>
          ) : null}
          <Button onClick={() => setImportOpen(true)}>
            <Upload />
            Import mailboxes
          </Button>
        </div>
      </div>

      {stats.recommendToAdd > 0 ? (
        <Alert variant="warning">
          <AlertTitle>
            Add about {stats.recommendToAdd.toLocaleString()} more {stats.recommendToAdd === 1 ? "mailbox" : "mailboxes"}
          </AlertTitle>
          <AlertDescription>
            Running campaigns ask for {stats.totalDailyDemand.toLocaleString()} emails a day and the pool can send{" "}
            {stats.totalDailyCapacity.toLocaleString()} today, at up to {stats.targetPacePerMailbox} per mailbox (fewer
            while new mailboxes warm up). New mailboxes start sending for running campaigns right away.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat
          bare
          label="Active mailboxes"
          value={stats.activeMailboxes.toLocaleString()}
          hint={`${stats.totalMailboxes.toLocaleString()} in the pool, ${stats.pausedMailboxes.toLocaleString()} paused`}
        />
        <Stat
          bare
          label="Sent today"
          value={stats.emailsSentToday.toLocaleString()}
          hint={`of ${stats.totalDailyCapacity.toLocaleString()} possible today, plus ${stats.repliesSentToday.toLocaleString()} ${stats.repliesSentToday === 1 ? "reply" : "replies"}`}
        />
        <Stat
          bare
          label="Daily capacity"
          value={stats.totalDailyCapacity.toLocaleString()}
          hint="Includes warm-up limits for new mailboxes"
        />
        <Stat
          bare
          label="Daily demand"
          value={stats.totalDailyDemand.toLocaleString()}
          delta={{ value: util.short, tone: util.tone }}
          hint={`${stats.utilizationPercent.toLocaleString()}% of capacity, from running campaigns. ${util.label}.`}
        />
      </Card>

      <AdminPoolCustomers customers={stats.customers} />

      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
          <CardDescription>
            Pausing stops new outreach from a mailbox. Its inbox is still read, replies to existing conversations still
            go out, and its follow-ups wait until you resume it. Retire a mailbox to move its follow-ups to other
            mailboxes. Resuming runs a live SMTP and IMAP login test first.
          </CardDescription>
        </CardHeader>

        {stats.mailboxes.length > 0 ? (
          <div className="flex flex-col gap-3 px-5 pt-4 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                aria-label="Search mailboxes"
                className="pl-9"
              />
            </div>
            <div className="max-w-full overflow-x-auto">
              <SegmentedControl
                size="sm"
                aria-label="Filter mailboxes by status"
                value={statusFilter}
                onValueChange={setStatusFilter}
                options={[
                  { value: "all", label: withCount("All", counts.all) },
                  { value: "active", label: withCount("Active", counts.active) },
                  { value: "paused", label: withCount("Paused", counts.paused) },
                  { value: "failed", label: withCount("Failed", counts.failed) },
                ]}
              />
            </div>
          </div>
        ) : null}

        {stats.mailboxes.length === 0 ? (
          <EmptyState
            compact
            icon={Mail}
            title="No shared mailboxes yet"
            description="Import a CSV of mailboxes to start the pool. Each one is login-tested before it sends."
            action={
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Upload />
                Import mailboxes
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon={SearchX}
            title="No mailboxes match these filters"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="mt-4 border-t border-border">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Mailbox</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Connection</TableHead>
                  <TableHead className="text-right">Health</TableHead>
                  <TableHead className="w-[22%]">Sent today</TableHead>
                  <TableHead className="text-right">Replies today</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((m) => {
                  const pct = m.effectiveCap > 0 ? Math.min(100, Math.round((m.todaySent / m.effectiveCap) * 100)) : 0;
                  const healthTone =
                    m.health >= 90 ? "text-success-text" : m.health >= 70 ? "text-warning-text" : "text-destructive-text";
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium">{m.senderName || m.email}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                        {m.status === "failed" && m.failedReason ? (
                          <>
                            <div className="truncate text-xs text-destructive-text" title={m.failedReason}>
                              {m.failedReason}
                            </div>
                            <div className="text-xs text-subtle-foreground">We re-test it automatically every 6 hours.</div>
                          </>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(m.status)} dot className="capitalize">
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={connectionVariant(m.smtpStatus)}>SMTP {m.smtpStatus}</Badge>
                          <Badge variant={connectionVariant(m.imapStatus)}>IMAP {m.imapStatus}</Badge>
                          {m.readProblem ? (
                            <Badge variant="destructive" title={m.readProblem}>
                              Replies not read
                              <span className="sr-only">: {m.readProblem}</span>
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className={`tabular text-right font-medium ${healthTone}`}>{m.health}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress
                            value={pct}
                            className="flex-1"
                            aria-label={`${m.todaySent} of ${m.effectiveCap} sent today`}
                          />
                          <span className="tabular w-14 shrink-0 text-right text-xs text-muted-foreground">
                            {m.todaySent} / {m.effectiveCap}
                          </span>
                        </div>
                        {m.warmingUp ? (
                          <Badge variant="neutral" className="mt-1.5" title={`Warming up: ${m.effectiveCap} a day today, ${m.dailyLimit} once warmed up`}>
                            Warming up
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {m.repliesToday.toLocaleString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {m.lastSyncAt ? (
                          <time suppressHydrationWarning dateTime={m.lastSyncAt}>
                            {timeAgo(m.lastSyncAt)}
                          </time>
                        ) : (
                          "Never"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="xs"
                            loading={busyId === m.id}
                            disabled={busyId !== null && busyId !== m.id}
                            onClick={() => handleToggle(m)}
                            aria-label={`${m.status === "active" ? "Pause" : "Resume"} ${m.email}`}
                          >
                            {busyId === m.id ? null : m.status === "active" ? <Pause /> : <Play />}
                            {m.status === "active" ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={busyId !== null}
                            onClick={() => setRetireTarget(m)}
                            aria-label={`Retire ${m.email}`}
                          >
                            <Archive />
                            Retire
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <AdminUnmatchedInbound />

      <ImportMailboxesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={async () => {
          setImportOpen(false);
          await refreshStats();
        }}
      />

      <Dialog open={retireTarget !== null} onOpenChange={(o) => !retiring && !o && setRetireTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire {retireTarget?.email}?</DialogTitle>
            <DialogDescription>
              It stops sending for good. Follow-ups it was due to send move to other pool mailboxes, its inbox is still
              read for 30 days, and replies in its conversations are held for the customer. Re-import the mailbox to use
              it again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetireTarget(null)} disabled={retiring}>
              Cancel
            </Button>
            <Button variant="destructive" loading={retiring} onClick={handleRetire}>
              Retire mailbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={takeOverOpen} onOpenChange={(o) => !takingOver && setTakeOverOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Take over the pool</DialogTitle>
            <DialogDescription>
              Make your account the owner of all {poolMailboxTotal.toLocaleString()} shared{" "}
              {poolMailboxTotal === 1 ? "mailbox" : "mailboxes"}? The current owner can then delete their account without
              affecting the pool.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTakeOverOpen(false)} disabled={takingOver}>
              Cancel
            </Button>
            <Button loading={takingOver} onClick={handleTakeOver}>
              Take over the pool
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImportMailboxesDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void | Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const [target, setTarget] = useState<"pool" | "customer">("pool");
  const [ownerEmail, setOwnerEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const forCustomer = target === "customer";
  const ownerEmailClean = ownerEmail.trim().toLowerCase();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (forCustomer && !ownerEmailClean) {
      toast.error("Enter the customer's account email first.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const parsed = parseCsvText(await file.text());
      if (parsed.rows.length === 0) {
        toast.error("That CSV has no rows.");
        return;
      }

      const mappedRows = parsed.rows.map((r) => {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) {
          const field = HEADER_MAP[k.toLowerCase().trim()];
          if (field) out[field] = v;
        }
        return out;
      });

      const res = await importSystemMailboxesCsv(
        mappedRows,
        forCustomer ? { ownerEmail: ownerEmailClean } : undefined,
      );
      if (!res.ok) {
        toast.error(`Import failed. Nothing was saved.${res.failed[0] ? ` ${res.failed[0].error}.` : ""}`);
        return;
      }
      if (res.activated > 0) {
        toast.success(
          `${res.activated} ${res.activated === 1 ? "mailbox passed" : "mailboxes passed"} the SMTP and IMAP login test and ${res.activated === 1 ? "is" : "are"} active${forCustomer ? `, assigned to ${ownerEmailClean}` : ""}.`,
        );
      }
      for (const m of res.inactive) {
        toast.warning(`Row ${m.row} (${m.email}) saved as inactive: ${m.error}`);
      }
      for (const f of res.failed) {
        toast.error(`Row ${f.row} not imported: ${f.error}`);
      }
      if (res.imported === 0 && res.failed.length === 0) {
        toast.error("Nothing was imported.");
      }
      await onImported();
    } catch (err: any) {
      toast.error(err?.message || "Could not read that file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !uploading && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{forCustomer ? "Assign mailboxes to one customer" : "Import shared mailboxes"}</DialogTitle>
          <DialogDescription>
            {forCustomer
              ? "Assign mailboxes to one customer. These send only that customer's manual campaigns and never join the shared pool."
              : "Upload a CSV with one mailbox per row. Each mailbox is tested with a real SMTP and IMAP login. Mailboxes that pass go live in the shared pool; ones that fail are saved as inactive so you can fix and resume them."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-foreground" aria-hidden>
              Add to
            </span>
            <SegmentedControl
              size="sm"
              aria-label="Add to"
              value={target}
              onValueChange={setTarget}
              options={[
                { value: "pool", label: "Shared pool" },
                { value: "customer", label: "One customer" },
              ]}
            />
          </div>
          {forCustomer ? (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="import-owner-email" className="text-[13px] font-medium text-foreground">
                Customer&apos;s account email
              </label>
              <Input
                id="import-owner-email"
                type="email"
                required
                autoComplete="off"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={uploading}
              />
            </div>
          ) : null}
        </div>

        <div className="rounded-lg bg-muted/60 p-3 text-[13px] text-muted-foreground">
          <p className="font-medium text-foreground">Columns</p>
          <p className="mt-1 leading-relaxed">
            sender name, email, smtp host, smtp port, smtp username, smtp password, smtp security, imap host, imap port,
            imap username, imap password, daily limit, hourly limit, timezone, signature
          </p>
          <a
            href="/example_senders.csv"
            download="example_senders.csv"
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
          >
            <Download className="size-4" aria-hidden />
            Download example CSV
          </a>
        </div>

        <input
          type="file"
          accept=".csv,text/csv"
          ref={fileInputRef}
          onChange={handleFile}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button
            loading={uploading}
            disabled={forCustomer && !ownerEmailClean}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? null : <Upload />}
            {uploading ? "Testing and importing" : "Choose CSV file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useRef, useState } from "react";
import { Download, Mail, Pause, Play, Search, SearchX, Upload } from "lucide-react";
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
  toggleSystemMailboxStatus,
  type SystemMailboxPoolStats,
} from "@/lib/admin-gtm-actions";

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

/** Average sent today per active mailbox, bucketed by the server. */
const UTILIZATION = {
  green: { short: "Healthy", label: "Under 30 is healthy", tone: "success" as const },
  yellow: { short: "Near capacity", label: "30 to 49 is near capacity", tone: "neutral" as const },
  red: { short: "Over capacity", label: "50 or more is over capacity", tone: "destructive" as const },
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
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Shared mailboxes that approved accounts send from. The target is {stats.targetPacePerMailbox} emails a day
          per mailbox, which keeps domain reputation safe.
        </p>
        <Button onClick={() => setImportOpen(true)} className="shrink-0">
          <Upload />
          Import mailboxes
        </Button>
      </div>

      {stats.recommendToAdd > 0 ? (
        <Alert variant="warning">
          <AlertTitle>
            Add about {stats.recommendToAdd.toLocaleString()} more {stats.recommendToAdd === 1 ? "mailbox" : "mailboxes"}
          </AlertTitle>
          <AlertDescription>
            The pool should have {stats.recommendedTotalMailboxes.toLocaleString()} active mailboxes and{" "}
            {stats.activeMailboxes.toLocaleString()} are active. Active campaigns need{" "}
            {stats.totalDailyDemand.toLocaleString()} emails a day at up to {stats.targetPacePerMailbox} per mailbox.
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
        <Stat bare label="Sent today" value={stats.emailsSentToday.toLocaleString()} hint="Across the shared pool" />
        <Stat
          bare
          label="Sent per mailbox"
          value={stats.averageEmailsPerMailbox.toLocaleString()}
          delta={{ value: util.short, tone: util.tone }}
          hint={`Today, per active mailbox. ${util.label}.`}
        />
        <Stat
          bare
          label="Daily demand"
          value={stats.totalDailyDemand.toLocaleString()}
          hint="Emails a day needed by active campaigns"
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mailboxes</CardTitle>
          <CardDescription>Pause a mailbox to stop it sending. Resuming runs a live SMTP and IMAP login test first.</CardDescription>
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
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((m) => {
                  const pct = m.dailyLimit > 0 ? Math.min(100, Math.round((m.todaySent / m.dailyLimit) * 100)) : 0;
                  const healthTone =
                    m.health >= 90 ? "text-success-text" : m.health >= 70 ? "text-warning-text" : "text-destructive-text";
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium">{m.senderName || m.email}</div>
                        <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(m.status)} dot className="capitalize">
                          {m.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1.5">
                          <Badge variant={connectionVariant(m.smtpStatus)}>SMTP {m.smtpStatus}</Badge>
                          <Badge variant={connectionVariant(m.imapStatus)}>IMAP {m.imapStatus}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className={`tabular text-right font-medium ${healthTone}`}>{m.health}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress
                            value={pct}
                            className="flex-1"
                            aria-label={`${m.todaySent} of ${m.dailyLimit} sent today`}
                          />
                          <span className="tabular w-14 shrink-0 text-right text-xs text-muted-foreground">
                            {m.todaySent} / {m.dailyLimit}
                          </span>
                        </div>
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ImportMailboxesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={async () => {
          setImportOpen(false);
          await refreshStats();
        }}
      />
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

      const res = await importSystemMailboxesCsv(mappedRows);
      if (!res.ok) {
        toast.error("Import failed. Nothing was saved.");
        return;
      }
      if (res.activated > 0) {
        toast.success(
          `${res.activated} ${res.activated === 1 ? "mailbox passed" : "mailboxes passed"} the SMTP and IMAP login test and ${res.activated === 1 ? "is" : "are"} active.`,
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
          <DialogTitle>Import shared mailboxes</DialogTitle>
          <DialogDescription>
            Upload a CSV with one mailbox per row. Each mailbox is tested with a real SMTP and IMAP login. Mailboxes
            that pass go live in the shared pool; ones that fail are saved as inactive so you can fix and resume them.
          </DialogDescription>
        </DialogHeader>

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
          <Button loading={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? null : <Upload />}
            {uploading ? "Testing and importing" : "Choose CSV file"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

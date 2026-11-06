"use client";

import { useEffect, useMemo, useState } from "react";
import { Bug, Download, ExternalLink } from "lucide-react";
import { formatDateTime, timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  DataList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  NativeSelect,
  SegmentedControl,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@smartreach/ui";
import type { BugReportDTO, BugReportStatus } from "@/lib/bug-reports";
import { updateBugReportStatusAction } from "@/lib/bug-report-actions";
import {
  NoMatches,
  RowActionsButton,
  SearchField,
  Toolbar,
  WORK_STATUSES,
  countBy,
  downloadCsv,
  safeExternalUrl,
  todayStamp,
  workStatusMeta,
  withCount,
} from "./admin-ui";

/** Bug reports from every user. Open one to read the full report and change its status. */
export function AdminBugReportsView({
  initialReports,
  onOpenCountChange,
}: {
  initialReports: BugReportDTO[];
  onOpenCountChange?: (count: number) => void;
}) {
  const [reports, setReports] = useState<BugReportDTO[]>(initialReports);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BugReportStatus>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  // The selected report stays set while the sheet animates closed.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openReport = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  const statusCounts = useMemo(() => countBy(reports, (r) => r.status), [reports]);
  const openCount = statusCounts.open ?? 0;
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    onOpenCountChange?.(openCount);
  }, [openCount, onOpenCountChange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.heading.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        (r.userName ?? "").toLowerCase().includes(q)
      );
    });
  }, [reports, statusFilter, search]);

  const changeStatus = async (report: BugReportDTO, status: BugReportStatus) => {
    if (report.status === status) return;
    setUpdatingId(report.id);
    try {
      const res = await updateBugReportStatusAction(report.id, status);
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === report.id ? { ...r, status, updatedAt: new Date().toISOString() } : r)),
        );
        toast.success(`Bug report marked as ${workStatusMeta(status).label.toLowerCase()}.`);
      } else {
        toast.error(res.error || "Could not update the bug report.");
      }
    } catch (err) {
      console.error("Failed to update status:", err);
      toast.error("Could not update the bug report. Try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `smartreach-bug-reports-${todayStamp()}.csv`,
      ["Report ID", "Date (UTC)", "User Name", "User Email", "Heading / Title", "Description", "Status", "Page URL"],
      filtered.map((r) => [r.id, r.createdAt, r.userName || "N/A", r.userEmail, r.heading, r.description, r.status, r.url || ""]),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download />
            Export CSV
          </Button>
        }
      >
        <SearchField value={search} onChange={setSearch} placeholder="Search title, details or reporter" label="Search bug reports" />
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            size="sm"
            aria-label="Filter bug reports by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: "all", label: withCount("All", reports.length) },
              ...WORK_STATUSES.map((s) => ({ value: s.value, label: withCount(s.label, statusCounts[s.value] ?? 0) })),
            ]}
          />
        </div>
      </Toolbar>

      <Card className="overflow-hidden">
        {reports.length === 0 ? (
          <EmptyState compact icon={Bug} title="No bug reports yet" description="Reports sent from the bug report page appear here." />
        ) : filtered.length === 0 ? (
          <NoMatches
            what="bug reports"
            onClear={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          />
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[48%]">Report</TableHead>
                <TableHead>Reported by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const status = workStatusMeta(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[460px]">
                      <button
                        type="button"
                        onClick={() => openReport(r.id)}
                        className="block max-w-full truncate text-left font-medium hover:underline"
                      >
                        {r.heading}
                      </button>
                      <p className="mt-0.5 line-clamp-2 text-muted-foreground">{r.description}</p>
                    </TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate">{r.userName || r.userEmail}</span>
                      {r.userName ? <span className="block truncate text-xs text-muted-foreground">{r.userEmail}</span> : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant} dot>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <time suppressHydrationWarning dateTime={r.createdAt} title={formatDateTime(r.createdAt)}>
                        {timeAgo(r.createdAt)}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <RowActionsButton label={`Actions for ${r.heading}`} disabled={updatingId === r.id} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => openReport(r.id)}>View report</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Status</DropdownMenuLabel>
                          <DropdownMenuRadioGroup
                            value={r.status}
                            onValueChange={(v) => void changeStatus(r, v as BugReportStatus)}
                          >
                            {WORK_STATUSES.map((s) => (
                              <DropdownMenuRadioItem key={s.value} value={s.value}>
                                {s.label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Sheet open={sheetOpen && selected !== null} onOpenChange={setSheetOpen}>
        <SheetContent>
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.heading}</SheetTitle>
                <SheetDescription>Received {formatDateTime(selected.createdAt)}</SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-6">
                <div>
                  <h3 className="mb-2 text-[13px] font-medium">What happened</h3>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">
                    {selected.description}
                  </p>
                </div>
                <DataList
                  items={[
                    {
                      label: "Reported by",
                      value: selected.userName ? `${selected.userName} (${selected.userEmail})` : selected.userEmail,
                    },
                    {
                      label: "Page",
                      value: safeExternalUrl(selected.url) ? (
                        <a
                          href={safeExternalUrl(selected.url)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                        >
                          <span className="truncate">{selected.url}</span>
                          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                        </a>
                      ) : (
                        selected.url || "Not recorded"
                      ),
                    },
                    { label: "Last updated", value: formatDateTime(selected.updatedAt) },
                    { label: "Report ID", value: <span className="font-mono text-xs">{selected.id}</span> },
                  ]}
                />
                <Field label="Status" hint="Ongoing means someone is working on it.">
                  <NativeSelect
                    value={selected.status}
                    disabled={updatingId === selected.id}
                    onChange={(e) => void changeStatus(selected, e.target.value as BugReportStatus)}
                  >
                    {WORK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </SheetBody>
              <SheetFooter>
                <SheetClose asChild>
                  <Button variant="outline">Close</Button>
                </SheetClose>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

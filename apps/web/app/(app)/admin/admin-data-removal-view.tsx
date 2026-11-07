"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { formatDateTime, timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
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
import type { DataRemovalRequestDTO, DataRemovalStatus } from "@/lib/data-removal";
import { eraseDataRemovalAction, updateDataRemovalStatusAction } from "@/lib/data-removal-actions";
import { NoMatches, RowActionsButton, SearchField, Toolbar, countBy, downloadCsv, todayStamp, withCount } from "./admin-ui";

const STATUSES: {
  value: DataRemovalStatus;
  label: string;
  action: string;
  variant: "info" | "warning" | "success" | "destructive";
}[] = [
  { value: "pending", label: "Pending", action: "Mark as pending", variant: "info" },
  { value: "in_progress", label: "In progress", action: "Mark as in progress", variant: "warning" },
  { value: "completed", label: "Completed", action: "Mark as completed", variant: "success" },
  { value: "rejected", label: "Rejected", action: "Mark as rejected", variant: "destructive" },
];

function statusMeta(status: string) {
  return STATUSES.find((s) => s.value === status) ?? STATUSES[0];
}

/** Final states are confirmed first: they record that the request is closed. */
const CONFIRM_COPY: Partial<Record<DataRemovalStatus, { title: string; description: string; label: string }>> = {
  completed: {
    title: "Mark this request as completed?",
    description: "Only possible after their data is deleted. It records that the request has been fulfilled.",
    label: "Mark as completed",
  },
  rejected: {
    title: "Reject this request?",
    description: "Use this when the request is invalid or cannot be verified. Let the person know why by email.",
    label: "Reject request",
  },
};

/** Data removal (erasure) requests from users and the public form. */
export function AdminDataRemovalView({
  initialRequests,
  onPendingCountChange,
}: {
  initialRequests: DataRemovalRequestDTO[];
  onPendingCountChange?: (count: number) => void;
}) {
  const [requests, setRequests] = useState<DataRemovalRequestDTO[]>(initialRequests);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DataRemovalStatus>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ request: DataRemovalRequestDTO; status: DataRemovalStatus } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [eraseTarget, setEraseTarget] = useState<DataRemovalRequestDTO | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);

  const statusCounts = useMemo(() => countBy(requests, (r) => r.status), [requests]);
  const pendingCount = statusCounts.pending ?? 0;
  const selected = requests.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    onPendingCountChange?.(pendingCount);
  }, [pendingCount, onPendingCountChange]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return r.contactEmail.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    });
  }, [requests, statusFilter, search]);

  const openRequest = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  const applyStatus = async (request: DataRemovalRequestDTO, status: DataRemovalStatus) => {
    setUpdatingId(request.id);
    try {
      const res = await updateDataRemovalStatusAction(request.id, status);
      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) => (r.id === request.id ? { ...r, status, updatedAt: new Date().toISOString() } : r)),
        );
        toast.success(`Request marked as ${statusMeta(status).label.toLowerCase()}.`);
      } else {
        toast.error(res.error || "Could not update the request.");
      }
    } catch (err) {
      console.error("Failed to update removal status:", err);
      toast.error("Could not update the request. Try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const eraseData = async (request: DataRemovalRequestDTO) => {
    setUpdatingId(request.id);
    try {
      const res = await eraseDataRemovalAction(request.id);
      if (res.ok && "directoryDeleted" in res) {
        setRequests((prev) =>
          prev.map((r) =>
            r.id === request.id && r.status === "pending"
              ? { ...r, status: "in_progress", updatedAt: new Date().toISOString() }
              : r,
          ),
        );
        const n = res.directoryDeleted ?? 0;
        const m = res.leadsDeleted ?? 0;
        toast.success(
          `Deleted ${n} directory ${n === 1 ? "record" : "records"} and ${m} ${m === 1 ? "lead" : "leads"}`,
        );
      } else {
        toast.error(res.error || "Could not delete their data.");
      }
    } catch (err) {
      console.error("Failed to delete removal request data:", err);
      toast.error("Could not delete their data. Try again.");
    } finally {
      setUpdatingId(null);
    }
  };

  const requestErase = (request: DataRemovalRequestDTO) => {
    setEraseTarget(request);
    setEraseOpen(true);
  };

  const requestStatus = (request: DataRemovalRequestDTO, status: DataRemovalStatus) => {
    if (request.status === status) return;
    if (CONFIRM_COPY[status]) {
      setConfirm({ request, status });
      setConfirmOpen(true);
      return;
    }
    void applyStatus(request, status);
  };

  const exportCsv = () => {
    downloadCsv(
      `data-removal-requests-${todayStamp()}.csv`,
      ["Request ID", "Date (UTC)", "Contact Email", "User ID", "Description (Requested Erasure)", "Status", "Updated At"],
      filtered.map((r) => [
        r.id,
        r.createdAt,
        r.contactEmail,
        r.userId || "anonymous visitor",
        r.description.replace(/\n/g, " "),
        r.status,
        r.updatedAt,
      ]),
    );
  };

  const confirmCopy = confirm ? CONFIRM_COPY[confirm.status] : undefined;

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
        <SearchField value={search} onChange={setSearch} placeholder="Search email or request" label="Search data requests" />
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            size="sm"
            aria-label="Filter data requests by status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { value: "all", label: withCount("All", requests.length) },
              ...STATUSES.map((s) => ({ value: s.value, label: withCount(s.label, statusCounts[s.value] ?? 0) })),
            ]}
          />
        </div>
      </Toolbar>

      <Card className="overflow-hidden">
        {requests.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title="No data removal requests"
            description="Requests from account settings and the public removal form appear here."
          />
        ) : filtered.length === 0 ? (
          <NoMatches
            what="requests"
            onClear={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          />
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Contact</TableHead>
                <TableHead className="w-[44%]">Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const status = statusMeta(r.status);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[240px]">
                      <button
                        type="button"
                        onClick={() => openRequest(r.id)}
                        className="block max-w-full truncate text-left font-medium hover:underline"
                      >
                        {r.contactEmail}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {r.userId ? "Registered user" : "Public form"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[420px]">
                      <p className="line-clamp-2 text-muted-foreground">{r.description}</p>
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
                      <StatusMenu
                        request={r}
                        disabled={updatingId === r.id}
                        onView={() => openRequest(r.id)}
                        onErase={() => requestErase(r)}
                        onStatus={(s) => requestStatus(r, s)}
                      />
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
                <SheetTitle className="truncate">{selected.contactEmail}</SheetTitle>
                <SheetDescription>Received {formatDateTime(selected.createdAt)}</SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-6">
                <div>
                  <h3 className="mb-2 text-[13px] font-medium">What they asked for</h3>
                  <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-4 text-sm leading-relaxed">
                    {selected.description}
                  </p>
                </div>
                <DataList
                  items={[
                    {
                      label: "Status",
                      value: (
                        <Badge variant={statusMeta(selected.status).variant} dot>
                          {statusMeta(selected.status).label}
                        </Badge>
                      ),
                    },
                    { label: "Source", value: selected.userId ? "Registered user" : "Public form" },
                    {
                      label: "User ID",
                      value: selected.userId ? <span className="font-mono text-xs">{selected.userId}</span> : "None",
                    },
                    { label: "Last updated", value: formatDateTime(selected.updatedAt) },
                    { label: "Request ID", value: <span className="font-mono text-xs">{selected.id}</span> },
                  ]}
                />
              </SheetBody>
              <SheetFooter className="justify-between">
                <Button asChild variant="outline">
                  <a href={`mailto:${selected.contactEmail}`}>Email them</a>
                </Button>
                <div className="flex items-center gap-2">
                  <SheetClose asChild>
                    <Button variant="ghost">Close</Button>
                  </SheetClose>
                  <StatusMenu
                    request={selected}
                    disabled={updatingId === selected.id}
                    onErase={() => requestErase(selected)}
                    onStatus={(s) => requestStatus(selected, s)}
                    trigger="button"
                  />
                </div>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmCopy?.title ?? "Change status?"}
        description={
          confirm ? (
            <>
              {confirmCopy?.description} Request from <span className="font-medium text-foreground">{confirm.request.contactEmail}</span>.
            </>
          ) : undefined
        }
        confirmLabel={confirmCopy?.label ?? "Confirm"}
        destructive={confirm?.status === "rejected"}
        onConfirm={async () => {
          if (confirm) await applyStatus(confirm.request, confirm.status);
        }}
      />

      <ConfirmDialog
        open={eraseOpen}
        onOpenChange={setEraseOpen}
        title="Delete their data?"
        description={
          eraseTarget
            ? `Delete ${eraseTarget.contactEmail} from the lead directory and every customer's lead lists? The address stays on the suppression list, so nobody can email it again.`
            : undefined
        }
        confirmLabel="Delete their data"
        destructive
        onConfirm={async () => {
          if (eraseTarget) await eraseData(eraseTarget);
        }}
      />
    </div>
  );
}

function StatusMenu({
  request,
  disabled,
  onStatus,
  onView,
  onErase,
  trigger = "icon",
}: {
  request: DataRemovalRequestDTO;
  disabled: boolean;
  onStatus: (status: DataRemovalStatus) => void;
  onView?: () => void;
  onErase?: () => void;
  trigger?: "icon" | "button";
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger === "icon" ? (
          <RowActionsButton label={`Actions for request from ${request.contactEmail}`} disabled={disabled} />
        ) : (
          <Button loading={disabled}>Change status</Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onView ? (
          <>
            <DropdownMenuItem onSelect={onView}>View request</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={`mailto:${request.contactEmail}`}>Email {request.contactEmail}</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {onErase ? (
          <>
            <DropdownMenuItem destructive disabled={request.status === "completed"} onSelect={onErase}>
              Delete their data
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        {STATUSES.map((s) => (
          <Fragment key={s.value}>
            {s.value === "rejected" ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={request.status === s.value}
              destructive={s.value === "rejected"}
              onSelect={() => onStatus(s.value)}
            >
              {s.action}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

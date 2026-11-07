"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, UserCheck, UserX, UsersRound } from "lucide-react";
import { formatDate, formatDateTime, timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@smartreach/ui";
import type { AccountApprovalRow, AccountApprovalsPayload } from "@/lib/account-approvals";
import { approveUserAction, revokeUserApprovalAction } from "@/lib/admin-actions";
import { NoMatches, SearchField } from "./admin-ui";

type Pending = { kind: "approve" | "revoke"; row: AccountApprovalRow } | null;

function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function matches(row: AccountApprovalRow, q: string) {
  if (!q) return true;
  return [row.name, row.email, row.website ?? ""].some((v) => v.toLowerCase().includes(q));
}

/** Accounts waiting for approval to send, plus recently approved ones that can be revoked. */
export function AdminApprovalsView({
  initial,
  onPendingCountChange,
}: {
  initial: AccountApprovalsPayload;
  onPendingCountChange?: (count: number) => void;
}) {
  const [pending, setPending] = useState(initial.pending);
  const [approved, setApproved] = useState(initial.recentlyApproved);
  // `confirm` keeps the last target so the dialog text does not change while it animates closed.
  const [confirm, setConfirm] = useState<Pending>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ask = (next: NonNullable<Pending>) => {
    setConfirm(next);
    setConfirmOpen(true);
  };
  const [search, setSearch] = useState("");

  useEffect(() => {
    onPendingCountChange?.(pending.length);
  }, [pending.length, onPendingCountChange]);

  const q = search.trim().toLowerCase();
  const visiblePending = useMemo(() => pending.filter((r) => matches(r, q)), [pending, q]);
  const visibleApproved = useMemo(() => approved.filter((r) => matches(r, q)), [approved, q]);

  const approve = async (row: AccountApprovalRow) => {
    try {
      const res = await approveUserAction(row.userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPending((prev) => prev.filter((r) => r.userId !== row.userId));
      setApproved((prev) => [{ ...row, approvedAt: new Date().toISOString(), revokedAt: null }, ...prev]);
      if (res.warning) toast.warning(`${row.email}: ${res.warning}`);
      else toast.success(`Approved ${row.email}${res.emailed ? " and emailed them." : "."}`);
    } catch {
      toast.error("Could not approve. Try again.");
    }
  };

  const revoke = async (row: AccountApprovalRow) => {
    try {
      const res = await revokeUserApprovalAction(row.userId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setApproved((prev) => prev.filter((r) => r.userId !== row.userId));
      setPending((prev) =>
        [{ ...row, approvedAt: null, revokedAt: new Date().toISOString() }, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      toast.success(`Revoked ${row.email}.`);
    } catch {
      toast.error("Could not revoke. Try again.");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          New accounts can set everything up, but nothing sends until you approve them.{" "}
          {initial.emailOnApprove
            ? "Approving emails the user."
            : "No system mailer is configured, so approvals are not emailed."}
        </p>
        {pending.length + approved.length > 0 ? (
          <SearchField value={search} onChange={setSearch} placeholder="Search name, email or website" label="Search accounts" />
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waiting for approval</CardTitle>
          <CardDescription>
            {pending.length === 0
              ? "Nobody is waiting."
              : `${pending.length.toLocaleString()} ${pending.length === 1 ? "account" : "accounts"}, newest first.`}
          </CardDescription>
        </CardHeader>
        {pending.length === 0 ? (
          <EmptyState
            compact
            icon={UserCheck}
            title="Nobody is waiting for approval"
            description="New sign-ups appear here. They can explore the app while they wait."
          />
        ) : visiblePending.length === 0 ? (
          <NoMatches what="accounts" onClear={() => setSearch("")} />
        ) : (
          <AccountTable
            rows={visiblePending}
            dateLabel="Signed up"
            date={(r) => r.createdAt}
            action={(row) => (
              <Button variant="outline" size="sm" onClick={() => ask({ kind: "approve", row })}>
                <UserCheck />
                Approve
              </Button>
            )}
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recently approved</CardTitle>
          <CardDescription>Most recent approvals first. Revoke one to stop that account sending.</CardDescription>
        </CardHeader>
        {approved.length === 0 ? (
          <EmptyState compact icon={UsersRound} title="No approvals yet" description="Accounts you approve are listed here." />
        ) : visibleApproved.length === 0 ? (
          <NoMatches what="accounts" onClear={() => setSearch("")} />
        ) : (
          <AccountTable
            rows={visibleApproved}
            dateLabel="Approved"
            date={(r) => r.approvedAt}
            action={(row) => (
              <Button variant="destructive-outline" size="sm" onClick={() => ask({ kind: "revoke", row })}>
                <UserX />
                Revoke
              </Button>
            )}
          />
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirm?.kind === "revoke"
            ? `Revoke approval for ${confirm.row.email}?`
            : `Approve ${confirm?.row.email ?? "this account"}?`
        }
        description={
          confirm?.kind === "revoke"
            ? "Their campaigns stop sending until you approve them again. Their data is kept."
            : initial.emailOnApprove
              ? "They can start sending right away. We email them to say they are approved."
              : "They can start sending right away. No email is sent because no system mailer is configured."
        }
        confirmLabel={confirm?.kind === "revoke" ? "Revoke approval" : "Approve account"}
        destructive={confirm?.kind === "revoke"}
        onConfirm={async () => {
          if (!confirm) return;
          if (confirm.kind === "approve") await approve(confirm.row);
          else await revoke(confirm.row);
        }}
      />
    </div>
  );
}

function AccountTable({
  rows,
  dateLabel,
  date,
  action,
}: {
  rows: AccountApprovalRow[];
  dateLabel: string;
  date: (row: AccountApprovalRow) => string | null;
  action: (row: AccountApprovalRow) => React.ReactNode;
}) {
  return (
    <div className="mt-4 border-t border-border">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Account</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>{dateLabel}</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const when = date(row);
            return (
              <TableRow key={row.userId}>
                <TableCell className="max-w-[280px]">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.name || row.email}</span>
                    {!row.emailVerified && <Badge variant="outline">Email not verified</Badge>}
                    {!row.approvedAt && row.revokedAt ? (
                      <Badge variant="neutral" title={formatDateTime(row.revokedAt)} suppressHydrationWarning>
                        Revoked {formatDate(row.revokedAt)}
                      </Badge>
                    ) : null}
                  </div>
                  {row.name ? <div className="truncate text-xs text-muted-foreground">{row.email}</div> : null}
                </TableCell>
                <TableCell className="max-w-[240px]">
                  {row.website ? (
                    <a
                      href={websiteHref(row.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <span className="truncate">{row.website.replace(/^https?:\/\//i, "")}</span>
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  ) : (
                    <span className="text-subtle-foreground">No run yet</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <time suppressHydrationWarning dateTime={when ?? undefined} title={formatDateTime(when)}>
                    {timeAgo(when)}
                  </time>
                </TableCell>
                <TableCell className="text-right">{action(row)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

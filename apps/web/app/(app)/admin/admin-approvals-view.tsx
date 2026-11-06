"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Clock, ExternalLink, Loader2, UserCheck, UserX } from "lucide-react";
import { Button } from "@smartreach/ui";
import type { AccountApprovalRow, AccountApprovalsPayload } from "@/lib/account-approvals";
import { approveUserAction, revokeUserApprovalAction } from "@/lib/admin-actions";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function UserCell({ row }: { row: AccountApprovalRow }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">{row.name || row.email}</span>
        {!row.emailVerified && (
          <span className="rounded-full border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
            Unverified
          </span>
        )}
      </div>
      <div className="truncate text-xs text-zinc-500">{row.email}</div>
    </div>
  );
}

function WebsiteCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-xs text-zinc-600">No run yet</span>;
  return (
    <a
      href={websiteHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-[220px] items-center gap-1 truncate text-xs text-zinc-300 hover:text-white hover:underline"
    >
      <span className="truncate">{url.replace(/^https?:\/\//i, "")}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export function AdminApprovalsView({ initial }: { initial: AccountApprovalsPayload }) {
  const [pending, setPending] = useState(initial.pending);
  const [approved, setApproved] = useState(initial.recentlyApproved);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const approve = (row: AccountApprovalRow) => {
    setBusyId(row.userId);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await approveUserAction(row.userId);
        if (!res.ok) return setMessage({ tone: "error", text: res.error });
        setPending((prev) => prev.filter((r) => r.userId !== row.userId));
        setApproved((prev) => [{ ...row, approvedAt: new Date().toISOString() }, ...prev]);
        setMessage(
          res.warning
            ? { tone: "warn", text: `${row.email}: ${res.warning}` }
            : { tone: "ok", text: `Approved ${row.email}${res.emailed ? " and emailed them." : "."}` },
        );
      } catch {
        setMessage({ tone: "error", text: "Could not approve. Try again." });
      } finally {
        setBusyId(null);
      }
    });
  };

  const revoke = (row: AccountApprovalRow) => {
    if (!window.confirm(`Revoke sending for ${row.email}? Their campaigns stop sending until you approve them again.`)) {
      return;
    }
    setBusyId(row.userId);
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await revokeUserApprovalAction(row.userId);
        if (!res.ok) return setMessage({ tone: "error", text: res.error });
        setApproved((prev) => prev.filter((r) => r.userId !== row.userId));
        setPending((prev) => [{ ...row, approvedAt: null }, ...prev].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setMessage({ tone: "ok", text: `Revoked ${row.email}.` });
      } catch {
        setMessage({ tone: "error", text: "Could not revoke. Try again." });
      } finally {
        setBusyId(null);
      }
    });
  };

  const toneClass =
    message?.tone === "error"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
      : message?.tone === "warn"
        ? "border-amber-500/30 bg-amber-950/30 text-amber-200"
        : "border-emerald-500/30 bg-emerald-950/30 text-emerald-200";

  return (
    <section className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Pending approval</h2>
          <span className="rounded-full border border-amber-500/30 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            {pending.length}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">
          New accounts can set everything up; nothing sends until approved.
          {initial.emailOnApprove ? " Approving emails the user." : " No system mailer: approvals are not emailed."}
        </p>
      </div>

      {message && (
        <div className={`mx-4 mt-3 rounded-lg border px-3 py-2 text-xs ${toneClass}`}>{message.text}</div>
      )}

      {pending.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-6 text-xs text-zinc-500">
          <CheckCircle2 className="size-4 text-emerald-400" /> Nobody is waiting for approval.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800/80">
          {pending.map((row) => (
            <li key={row.userId} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-4">
              <UserCell row={row} />
              <WebsiteCell url={row.website} />
              <span className="text-xs text-zinc-500">Signed up {formatDate(row.createdAt)}</span>
              <Button
                type="button"
                variant="brand"
                size="sm"
                className="rounded-lg"
                onClick={() => approve(row)}
                disabled={busyId !== null}
              >
                {busyId === row.userId ? <Loader2 className="size-3 animate-spin" /> : <UserCheck className="size-3" />}
                Approve
              </Button>
            </li>
          ))}
        </ul>
      )}

      {approved.length > 0 && (
        <details className="border-t border-zinc-800/80">
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-medium text-zinc-400 hover:text-zinc-200">
            Recently approved ({approved.length})
          </summary>
          <ul className="divide-y divide-zinc-800/80">
            {approved.map((row) => (
              <li key={row.userId} className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-4">
                <UserCell row={row} />
                <WebsiteCell url={row.website} />
                <span className="text-xs text-zinc-500">Approved {formatDate(row.approvedAt)}</span>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => revoke(row)}
                  disabled={busyId !== null}
                >
                  {busyId === row.userId ? <Loader2 className="size-3 animate-spin" /> : <UserX className="size-3" />}
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

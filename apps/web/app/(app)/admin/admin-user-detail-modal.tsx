"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
} from "@smartreach/ui";
import {
  User,
  Mail,
  Eye,
  Server,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Loader2,
  Globe,
  Layers,
} from "lucide-react";
import { fetchUserDetailAction } from "@/lib/admin-actions";
import type { UserDetailActivity } from "@/lib/admin-analytics";

export function AdminUserDetailModal({
  userId,
  onClose,
}: {
  userId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<UserDetailActivity | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"mailboxes" | "pages">("mailboxes");

  useEffect(() => {
    if (!userId) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchUserDetailAction(userId)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load user detail:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!userId) return null;

  return (
    <Dialog open={Boolean(userId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6 rounded-none border border-zinc-800 bg-black text-white">
        <DialogHeader className="space-y-1 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">
            <User className="size-3.5 text-white" /> User Telemetry & Mailbox Profile
          </div>
          <DialogTitle className="text-xl font-mono font-bold flex flex-wrap items-center gap-2 text-white">
            <span>{data?.user.name || "Loading user..."}</span>
            <span className="text-xs font-normal text-zinc-400 font-mono bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-none">
              {data?.user.email || userId}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-zinc-500">
            Joined {data?.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : "..."} · User ID: {userId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3 font-mono">
            <Loader2 className="size-8 animate-spin text-white" />
            <p className="text-xs text-zinc-500">Loading user behavior and mailbox metrics...</p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs font-mono text-zinc-500">
            User details not found or failed to load.
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                  <Mail className="size-3.5 text-zinc-400" />
                  <span>Total Mailboxes</span>
                </div>
                <div className="text-lg font-mono font-bold text-white">
                  {data.mailboxes.length}
                </div>
                <div className="text-[11px] font-mono text-zinc-500">
                  {data.mailboxes.filter((m) => m.status === "active").length} active accounts
                </div>
              </div>

              <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                  <Eye className="size-3.5 text-zinc-400" />
                  <span>Pages Visited</span>
                </div>
                <div className="text-lg font-mono font-bold text-white">
                  {data.pageViews.length}
                </div>
                <div className="text-[11px] font-mono text-zinc-500">
                  across {data.pageCounts.length} unique routes
                </div>
              </div>

              <div className="rounded-none border border-zinc-800 bg-zinc-950 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono">
                  <Server className="size-3.5 text-zinc-400" />
                  <span>Health & Status</span>
                </div>
                <div className="text-lg font-mono font-bold text-white">
                  {data.mailboxes.some((m) => m.status === "failed" || m.smtpStatus === "failed")
                    ? "Attention Needed"
                    : data.mailboxes.length > 0
                    ? "Operational"
                    : "No Mailboxes"}
                </div>
                <div className="text-[11px] font-mono text-zinc-500">
                  {data.mailboxes.filter((m) => m.status === "failed").length} degraded
                </div>
              </div>
            </div>

            {/* Modal Internal Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("mailboxes")}
                className={`inline-flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all border ${
                  activeTab === "mailboxes"
                    ? "bg-zinc-800 border-zinc-700 text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <Mail className="size-3.5" />
                <span>Connected Mailboxes ({data.mailboxes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pages")}
                className={`inline-flex items-center gap-1.5 rounded-none px-3 py-1.5 text-xs font-mono uppercase tracking-wider transition-all border ${
                  activeTab === "pages"
                    ? "bg-zinc-800 border-zinc-700 text-white font-bold"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <Eye className="size-3.5" />
                <span>Page Navigation Log ({data.pageViews.length})</span>
              </button>
            </div>

            {/* Tab 1: Mailboxes */}
            {activeTab === "mailboxes" && (
              <div className="space-y-3">
                {data.mailboxes.length === 0 ? (
                  <div className="rounded-none border border-dashed border-zinc-800 p-8 text-center text-xs font-mono text-zinc-500 space-y-1">
                    <Mail className="mx-auto size-6 text-zinc-600 mb-2" />
                    <p className="font-semibold text-zinc-300">No mailboxes connected yet</p>
                    <p>This user has not configured any SMTP/IMAP sender accounts.</p>
                  </div>
                ) : (
                  <div className="rounded-none border border-zinc-800 overflow-hidden bg-black">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left font-mono">
                        <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase tracking-wider font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Sender Mailbox</th>
                            <th className="py-2.5 px-3">Host & Port</th>
                            <th className="py-2.5 px-3">SMTP / IMAP</th>
                            <th className="py-2.5 px-3">Daily Limit</th>
                            <th className="py-2.5 px-3">Health Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {data.mailboxes.map((mb) => {
                            const isHealthy = mb.status === "active" && mb.smtpStatus !== "failed";
                            return (
                              <tr key={mb.id} className="hover:bg-zinc-900/40 transition-colors">
                                <td className="py-2.5 px-3 font-medium text-white">
                                  <div>{mb.senderName || mb.email}</div>
                                  <div className="text-[11px] text-zinc-500 font-mono">{mb.email}</div>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-zinc-400">
                                  {mb.smtpHost || "custom"}:{mb.smtpPort || 587}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 border ${
                                        mb.smtpStatus === "ok"
                                          ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/30"
                                          : mb.smtpStatus === "failed"
                                          ? "bg-rose-950/20 text-rose-400 border-rose-500/30"
                                          : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                      }`}
                                    >
                                      SMTP: {mb.smtpStatus}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-none px-1.5 py-0.5 border ${
                                        mb.imapStatus === "ok"
                                          ? "bg-emerald-950/20 text-emerald-400 border-emerald-500/30"
                                          : mb.imapStatus === "failed"
                                          ? "bg-rose-950/20 text-rose-400 border-rose-500/30"
                                          : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                      }`}
                                    >
                                      IMAP: {mb.imapStatus}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-zinc-400 font-mono text-[11px]">
                                  {mb.dailyLimit} emails/day
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2 font-mono">
                                    <div className="w-12 bg-zinc-900 rounded-none h-1.5 overflow-hidden border border-zinc-800">
                                      <div
                                        className={`h-full rounded-none ${
                                          mb.health >= 80
                                            ? "bg-white"
                                            : mb.health >= 50
                                            ? "bg-amber-400"
                                            : "bg-rose-400"
                                        }`}
                                        style={{ width: `${mb.health}%` }}
                                      />
                                    </div>
                                    <span className="text-[11px] font-semibold text-zinc-300">{mb.health}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Page Views */}
            {activeTab === "pages" && (
              <div className="space-y-4">
                {/* Most visited sections summary */}
                <div className="space-y-1.5">
                  <div className="text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="size-3.5 text-white" /> Most Visited Sections by this User
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.pageCounts.map((pc) => (
                      <span
                        key={pc.path}
                        className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 font-mono"
                      >
                        <span className="text-white text-[11px]">{pc.path}</span>
                        <span className="text-zinc-500 text-[10px]">({pc.count} visits)</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chronological page log */}
                <div className="rounded-none border border-zinc-800 overflow-hidden bg-black">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left font-mono">
                      <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 text-[10px] uppercase tracking-wider font-semibold sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">Page Route</th>
                          <th className="py-2.5 px-3">Page Title</th>
                          <th className="py-2.5 px-3">Visited At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {data.pageViews.map((pv) => (
                          <tr key={pv.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="py-2 px-3 font-mono text-[11px] font-semibold text-white">
                              {pv.path}
                            </td>
                            <td className="py-2 px-3 text-zinc-400 truncate max-w-xs text-xs">
                              {pv.pageTitle || "—"}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-zinc-500 whitespace-nowrap font-mono">
                              {new Date(pv.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs font-mono uppercase tracking-wider rounded-none border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800"
              >
                Close Profile
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

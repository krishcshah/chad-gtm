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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6 rounded-xl border border-zinc-800/80 bg-zinc-950/95 backdrop-blur-xl text-white font-sans card-shine shadow-2xl">
        <DialogHeader className="space-y-1.5 border-b border-zinc-800/80 pb-4">
          <div className="flex items-center gap-2 text-xs font-medium text-zinc-400">
            <User className="size-3.5 text-zinc-300" /> User Telemetry & Mailbox Profile
          </div>
          <DialogTitle className="text-lg font-bold tracking-tight flex flex-wrap items-center gap-2 text-white">
            <span>{data?.user.name || "Loading user..."}</span>
            <span className="text-xs font-normal text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full">
              {data?.user.email || userId}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Joined {data?.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : "..."} · User ID: {userId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="size-7 animate-spin text-zinc-400" />
            <p className="text-xs text-zinc-500">Loading user behavior and mailbox metrics...</p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            User details not found or failed to load.
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Mail className="size-3.5 text-zinc-400" />
                  <span>Total Mailboxes</span>
                </div>
                <div className="text-xl font-bold tracking-tight text-white">
                  {data.mailboxes.length}
                </div>
                <div className="text-xs text-zinc-500">
                  {data.mailboxes.filter((m) => m.status === "active").length} active accounts
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Eye className="size-3.5 text-zinc-400" />
                  <span>Pages Visited</span>
                </div>
                <div className="text-xl font-bold tracking-tight text-white">
                  {data.pageViews.length}
                </div>
                <div className="text-xs text-zinc-500">
                  across {data.pageCounts.length} unique routes
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <Server className="size-3.5 text-zinc-400" />
                  <span>Health & Status</span>
                </div>
                <div className="text-xl font-bold tracking-tight text-white">
                  {data.mailboxes.some((m) => m.status === "failed" || m.smtpStatus === "failed")
                    ? "Attention Needed"
                    : data.mailboxes.length > 0
                    ? "Operational"
                    : "No Mailboxes"}
                </div>
                <div className="text-xs text-zinc-500">
                  {data.mailboxes.filter((m) => m.status === "failed").length} degraded
                </div>
              </div>
            </div>

            {/* Modal Internal Tabs */}
            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("mailboxes")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                  activeTab === "mailboxes"
                    ? "bg-zinc-800 border-zinc-700 text-white shadow-xs"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900"
                }`}
              >
                <Mail className="size-3.5" />
                <span>Connected Mailboxes ({data.mailboxes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pages")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all border ${
                  activeTab === "pages"
                    ? "bg-zinc-800 border-zinc-700 text-white shadow-xs"
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
                  <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-500 space-y-1">
                    <Mail className="mx-auto size-6 text-zinc-600 mb-2" />
                    <p className="font-medium text-zinc-300">No mailboxes connected yet</p>
                    <p>This user has not configured any SMTP/IMAP sender accounts.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-zinc-800/80 overflow-hidden bg-zinc-900/20">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 text-xs font-medium">
                          <tr>
                            <th className="py-2.5 px-3 font-medium">Sender Mailbox</th>
                            <th className="py-2.5 px-3 font-medium">Host & Port</th>
                            <th className="py-2.5 px-3 font-medium">SMTP / IMAP</th>
                            <th className="py-2.5 px-3 font-medium">Daily Limit</th>
                            <th className="py-2.5 px-3 font-medium">Health Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                          {data.mailboxes.map((mb) => {
                            const isHealthy = mb.status === "active" && mb.smtpStatus !== "failed";
                            return (
                              <tr key={mb.id} className="hover:bg-zinc-900/40 transition-colors">
                                <td className="py-2.5 px-3 font-medium text-white">
                                  <div>{mb.senderName || mb.email}</div>
                                  <div className="text-[11px] text-zinc-500">{mb.email}</div>
                                </td>
                                <td className="py-2.5 px-3 text-[11px] text-zinc-400">
                                  {mb.smtpHost || "custom"}:{mb.smtpPort || 587}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5 text-[10px]">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                                        mb.smtpStatus === "ok"
                                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                                          : mb.smtpStatus === "failed"
                                          ? "bg-rose-950/40 text-rose-400 border-rose-500/30"
                                          : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                      }`}
                                    >
                                      SMTP: {mb.smtpStatus}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 border ${
                                        mb.imapStatus === "ok"
                                          ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/30"
                                          : mb.imapStatus === "failed"
                                          ? "bg-rose-950/40 text-rose-400 border-rose-500/30"
                                          : "bg-zinc-900 text-zinc-400 border-zinc-800"
                                      }`}
                                    >
                                      IMAP: {mb.imapStatus}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                                  {mb.dailyLimit} emails/day
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-12 bg-zinc-900 rounded-full h-1.5 overflow-hidden border border-zinc-800">
                                      <div
                                        className={`h-full rounded-full ${
                                          mb.health >= 80
                                            ? "bg-emerald-400"
                                            : mb.health >= 50
                                            ? "bg-amber-400"
                                            : "bg-rose-400"
                                        }`}
                                        style={{ width: `${mb.health}%` }}
                                      />
                                    </div>
                                    <span className="text-[11px] font-medium text-zinc-300">{mb.health}%</span>
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
                  <div className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                    <Layers className="size-3.5 text-zinc-300" /> Most Visited Sections by this User
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.pageCounts.map((pc) => (
                      <span
                        key={pc.path}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-800/80 bg-zinc-900/60 px-2 py-0.5 text-xs text-zinc-300"
                      >
                        <span className="text-white text-[11px]">{pc.path}</span>
                        <span className="text-zinc-500 text-[10px]">({pc.count} visits)</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chronological page log */}
                <div className="rounded-xl border border-zinc-800/80 overflow-hidden bg-zinc-900/20">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-zinc-900/60 border-b border-zinc-800/80 text-zinc-400 text-xs font-medium sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3 font-medium">Page Route</th>
                          <th className="py-2.5 px-3 font-medium">Page Title</th>
                          <th className="py-2.5 px-3 font-medium">Visited At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {data.pageViews.map((pv) => (
                          <tr key={pv.id} className="hover:bg-zinc-900/40 transition-colors">
                            <td className="py-2 px-3 text-[11px] font-medium text-white">
                              {pv.path}
                            </td>
                            <td className="py-2 px-3 text-zinc-400 truncate max-w-xs text-xs">
                              {pv.pageTitle || "—"}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-zinc-500 whitespace-nowrap">
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
                className="text-xs rounded-lg border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800"
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

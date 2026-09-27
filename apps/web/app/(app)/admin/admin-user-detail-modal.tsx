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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader className="space-y-1 border-b border-border/50 pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wider">
            <User className="size-3.5" /> User Behavior & Mailbox Profile
          </div>
          <DialogTitle className="text-xl font-bold flex flex-wrap items-center gap-2">
            <span>{data?.user.name || "Loading user..."}</span>
            <span className="text-xs font-normal text-muted-foreground font-mono bg-muted/60 px-2 py-0.5 rounded">
              {data?.user.email || userId}
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Joined {data?.user.createdAt ? new Date(data.user.createdAt).toLocaleDateString() : "..."} · User ID: {userId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center space-y-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Loading user behavior and mailbox metrics...</p>
          </div>
        ) : !data ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            User details not found or failed to load.
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Quick Stat Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="size-3.5 text-sky-400" />
                  <span>Total Mailboxes</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {data.mailboxes.length}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data.mailboxes.filter((m) => m.status === "active").length} active sender accounts
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Eye className="size-3.5 text-emerald-400" />
                  <span>Pages Visited</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {data.pageViews.length}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  across {data.pageCounts.length} unique app routes
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/60 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Server className="size-3.5 text-amber-400" />
                  <span>Health & Status</span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {data.mailboxes.some((m) => m.status === "failed" || m.smtpStatus === "failed")
                    ? "Attention Needed"
                    : data.mailboxes.length > 0
                    ? "Operational"
                    : "No Mailboxes"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {data.mailboxes.filter((m) => m.status === "failed").length} degraded
                </div>
              </div>
            </div>

            {/* Modal Internal Tabs */}
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("mailboxes")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === "mailboxes"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <Mail className="size-3.5" />
                <span>Connected Mailboxes ({data.mailboxes.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("pages")}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  activeTab === "pages"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
                  <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-xs text-muted-foreground space-y-1">
                    <Mail className="mx-auto size-6 text-muted-foreground/60 mb-2" />
                    <p className="font-semibold text-foreground">No mailboxes connected yet</p>
                    <p>This user has not configured any SMTP/IMAP sender accounts.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/60 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold">
                          <tr>
                            <th className="py-2.5 px-3">Sender Mailbox</th>
                            <th className="py-2.5 px-3">Host & Port</th>
                            <th className="py-2.5 px-3">SMTP / IMAP</th>
                            <th className="py-2.5 px-3">Daily Limit</th>
                            <th className="py-2.5 px-3">Health Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {data.mailboxes.map((mb) => {
                            const isHealthy = mb.status === "active" && mb.smtpStatus !== "failed";
                            return (
                              <tr key={mb.id} className="hover:bg-muted/30 transition-colors">
                                <td className="py-2.5 px-3 font-medium text-foreground">
                                  <div>{mb.senderName || mb.email}</div>
                                  <div className="text-[11px] text-muted-foreground font-mono">{mb.email}</div>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                                  {mb.smtpHost || "custom"}:{mb.smtpPort || 587}
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                        mb.smtpStatus === "ok"
                                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                          : mb.smtpStatus === "failed"
                                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      SMTP: {mb.smtpStatus}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                        mb.imapStatus === "ok"
                                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                          : mb.imapStatus === "failed"
                                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      IMAP: {mb.imapStatus}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {mb.dailyLimit} emails/day
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-2">
                                    <div className="w-12 bg-muted/60 rounded-full h-1.5 overflow-hidden">
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
                                    <span className="text-[11px] font-semibold text-foreground">{mb.health}%</span>
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
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" /> Most Visited Sections by this User
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.pageCounts.map((pc) => (
                      <span
                        key={pc.path}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs text-foreground font-medium"
                      >
                        <span className="font-mono text-primary text-[11px]">{pc.path}</span>
                        <span className="text-muted-foreground text-[10px]">({pc.count} visits)</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chronological page log */}
                <div className="rounded-xl border border-border/60 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 border-b border-border/60 text-muted-foreground font-semibold sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">Page Route</th>
                          <th className="py-2.5 px-3">Page Title</th>
                          <th className="py-2.5 px-3">Visited At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {data.pageViews.map((pv) => (
                          <tr key={pv.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 font-mono text-[11px] font-semibold text-primary">
                              {pv.path}
                            </td>
                            <td className="py-2 px-3 text-foreground/80 truncate max-w-xs">
                              {pv.pageTitle || "—"}
                            </td>
                            <td className="py-2 px-3 text-[11px] text-muted-foreground whitespace-nowrap">
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
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                Close Profile
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

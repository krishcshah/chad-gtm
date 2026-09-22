"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Flame, Inbox, Mail, ShieldCheck, Zap } from "lucide-react";
import { Badge, Button, Progress, cn } from "@smartreach/ui";

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  total: number;
  sent: number;
  replied: number;
}

interface SenderItem {
  id: string;
  senderName: string;
  email: string;
  status: string;
  health: number;
  dailyLimit: number;
  hourlyLimit: number;
  usedToday?: number;
  repliedCount?: number;
}

interface PerformanceBreakdownProps {
  campaigns: CampaignItem[];
  senders: SenderItem[];
}

export function PerformanceBreakdown({ campaigns, senders }: PerformanceBreakdownProps) {
  const [activeTab, setActiveTab] = useState<"campaigns" | "senders">("campaigns");

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 backdrop-blur shadow-xs overflow-hidden">
      {/* ReachInbox / Instantly Header & Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 bg-muted/20 px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl bg-background/80 p-1 border border-border/70 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab("campaigns")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                activeTab === "campaigns"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Campaigns ({campaigns.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("senders")}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                activeTab === "senders"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Email Accounts ({senders.length})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {activeTab === "campaigns" ? (
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              View all campaigns <ArrowUpRight className="size-3.5" />
            </Link>
          ) : (
            <Link
              href="/senders"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Manage inboxes <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Campaigns Table */}
      {activeTab === "campaigns" && (
        <div className="overflow-x-auto">
          {campaigns.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No active campaigns found in this workspace.{" "}
              <Link href="/campaigns/new" className="text-primary font-medium hover:underline">
                Create your first campaign
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10 text-muted-foreground font-medium">
                  <th className="px-5 py-3">Campaign Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Leads Contacted</th>
                  <th className="px-4 py-3 text-right">Replies</th>
                  <th className="px-4 py-3 text-right">Emails Sent</th>
                  <th className="px-4 py-3 text-right">Insight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {campaigns.map((c) => {
                  const replyRate = c.sent > 0 ? ((c.replied / c.sent) * 100).toFixed(1) : "0.0";
                  const isHighReply = Number(replyRate) >= 3.0;

                  return (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground">
                        <Link
                          href={c.status === "draft" ? `/campaigns/new?draft=${c.id}` : `/campaigns/${c.id}`}
                          className="hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          <span>{c.name}</span>
                          <ArrowUpRight className="size-3 opacity-0 group-hover:opacity-100 text-muted-foreground" />
                        </Link>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            c.status === "running" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                            c.status === "scheduled" && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                            c.status === "paused" && "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                            c.status === "draft" && "bg-muted text-muted-foreground border border-border/60",
                            c.status === "completed" && "bg-purple-500/10 text-purple-400 border border-purple-500/20",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              c.status === "running" && "bg-emerald-400 animate-pulse",
                              c.status === "scheduled" && "bg-blue-400",
                              c.status === "paused" && "bg-amber-400",
                              c.status === "draft" && "bg-muted-foreground",
                              c.status === "completed" && "bg-purple-400",
                            )}
                          />
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground tabular-nums">
                        {c.sent.toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <span className="font-semibold text-emerald-400">{c.replied}</span>{" "}
                        <span className="text-[11px] text-muted-foreground">({replyRate}%)</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-muted-foreground tabular-nums">
                        {c.total > 0 ? `${c.sent}/${c.total}` : c.sent.toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {isHighReply ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] gap-1">
                            <Flame className="size-3" /> High Reply Rate
                          </Badge>
                        ) : c.status === "running" ? (
                          <span className="text-[11px] text-muted-foreground">Active delivery</span>
                        ) : c.status === "draft" ? (
                          <span className="text-[11px] text-muted-foreground">Draft setup</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Email Accounts Table */}
      {activeTab === "senders" && (
        <div className="overflow-x-auto">
          {senders.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No sender inboxes connected.{" "}
              <Link href="/senders/new" className="text-primary font-medium hover:underline">
                Connect your first mailbox
              </Link>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-muted/10 text-muted-foreground font-medium">
                  <th className="px-5 py-3">Sender Inbox</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Health Score</th>
                  <th className="px-4 py-3 text-right">Sent Today / Limit</th>
                  <th className="px-4 py-3 text-right">Replies</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {senders.map((s) => {
                  const sent = s.usedToday ?? 0;
                  const limit = s.dailyLimit || 50;
                  const pct = Math.min(100, Math.round((sent / limit) * 100));

                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                            <Mail className="size-3.5" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{s.email}</p>
                            <p className="text-[11px] text-muted-foreground">{s.senderName || "Default Sender"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            s.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full",
                              s.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-amber-400",
                            )}
                          />
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                          <ShieldCheck className="size-3.5" />
                          <span>{s.health || 100}% Clean</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right tabular-nums">
                        <div className="inline-flex flex-col items-end">
                          <span className="font-medium text-foreground">
                            {sent} / {limit}
                          </span>
                          <div className="w-20 mt-1">
                            <Progress value={pct} className="h-1" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-foreground tabular-nums">
                        {s.repliedCount ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

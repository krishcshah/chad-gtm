"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Inbox,
  Layers,
  Mail,
  Rocket,
  Users,
} from "lucide-react";
import { Badge, Button, cn } from "@smartreach/ui";

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  campaignId?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: string | Date;
}

interface ActivityFeedProps {
  initialActivities: ActivityItem[];
}

function formatRelativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 45) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface GroupedActivity {
  id: string;
  type: string;
  category: "replies" | "campaigns" | "imports" | "system";
  title: string;
  subtitle?: string;
  count?: number;
  campaignId?: string | null;
  link?: string;
  linkLabel?: string;
  timestamp: Date;
  badgeColor: string;
  icon: typeof Activity;
}

export function ActivityFeed({ initialActivities }: ActivityFeedProps) {
  const [filter, setFilter] = useState<"all" | "replies" | "campaigns" | "imports">("all");

  const grouped = useMemo(() => {
    const list: GroupedActivity[] = [];
    let pendingImportBatch: {
      count: number;
      batches: number;
      firstDate: Date;
      lastDate: Date;
      ids: string[];
    } | null = null;

    const flushImports = () => {
      if (!pendingImportBatch) return;
      list.push({
        id: pendingImportBatch.ids[0] ?? Math.random().toString(),
        type: "leads.imported.consolidated",
        category: "imports",
        title: `Bulk imported ${pendingImportBatch.count.toLocaleString()} leads`,
        subtitle: `Aggregated from ${pendingImportBatch.batches} processed batches`,
        count: pendingImportBatch.count,
        link: "/leads",
        linkLabel: "View leads",
        timestamp: pendingImportBatch.firstDate,
        badgeColor: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        icon: Users,
      });
      pendingImportBatch = null;
    };

    for (const act of initialActivities) {
      const actDate = new Date(act.createdAt);
      const isLeadImport = act.type === "leads.imported" || act.message.toLowerCase().includes("imported") && act.message.toLowerCase().includes("lead");

      if (isLeadImport) {
        // Extract number of leads from message like "Imported 839 leads"
        const match = act.message.match(/imported\s+(\d+)\s+leads?/i);
        const count = match ? parseInt(match[1], 10) : 1;

        if (pendingImportBatch) {
          // If within 15 minutes of the last import, group together
          const timeDiff = Math.abs(pendingImportBatch.lastDate.getTime() - actDate.getTime());
          if (timeDiff < 15 * 60 * 1000) {
            pendingImportBatch.count += count;
            pendingImportBatch.batches += 1;
            pendingImportBatch.lastDate = actDate;
            pendingImportBatch.ids.push(act.id);
            continue;
          } else {
            flushImports();
          }
        }

        pendingImportBatch = {
          count,
          batches: 1,
          firstDate: actDate,
          lastDate: actDate,
          ids: [act.id],
        };
        continue;
      }

      // If not a lead import, flush any pending batch
      flushImports();

      // Categorize event
      const typeLower = act.type.toLowerCase();
      const msgLower = act.message.toLowerCase();

      if (typeLower.includes("reply") || msgLower.includes("replied") || msgLower.includes("reply")) {
        list.push({
          id: act.id,
          type: act.type,
          category: "replies",
          title: "New lead reply received",
          subtitle: act.message,
          link: "/unibox",
          linkLabel: "Open UniBox",
          timestamp: actDate,
          badgeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          icon: Inbox,
        });
      } else if (typeLower.includes("campaign") || msgLower.includes("campaign")) {
        list.push({
          id: act.id,
          type: act.type,
          category: "campaigns",
          title: "Campaign status update",
          subtitle: act.message,
          campaignId: act.campaignId,
          link: act.campaignId ? `/campaigns/${act.campaignId}` : "/campaigns",
          linkLabel: "View campaign",
          timestamp: actDate,
          badgeColor: "bg-violet-500/10 text-violet-400 border-violet-500/20",
          icon: Rocket,
        });
      } else if (typeLower.includes("bounce") || msgLower.includes("bounce") || msgLower.includes("failed")) {
        list.push({
          id: act.id,
          type: act.type,
          category: "system",
          title: "Deliverability alert",
          subtitle: act.message,
          link: "/analytics",
          linkLabel: "Review health",
          timestamp: actDate,
          badgeColor: "bg-rose-500/10 text-rose-400 border-rose-500/20",
          icon: AlertTriangle,
        });
      } else if (typeLower.includes("sender") || msgLower.includes("sender")) {
        list.push({
          id: act.id,
          type: act.type,
          category: "system",
          title: "Mailbox activity",
          subtitle: act.message,
          link: "/senders",
          linkLabel: "Manage mailboxes",
          timestamp: actDate,
          badgeColor: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
          icon: Mail,
        });
      } else {
        list.push({
          id: act.id,
          type: act.type,
          category: "system",
          title: act.message,
          subtitle: undefined,
          timestamp: actDate,
          badgeColor: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
          icon: Activity,
        });
      }
    }

    flushImports();
    return list;
  }, [initialActivities]);

  const filtered = useMemo(() => {
    if (filter === "all") return grouped;
    return grouped.filter((item) => item.category === filter);
  }, [grouped, filter]);

  return (
    <div className="flex flex-col h-full">
      {/* Feed Category Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-border/40 pb-2 mb-3">
        {(
          [
            { id: "all", label: "All" },
            { id: "replies", label: "Replies" },
            { id: "campaigns", label: "Campaigns" },
            { id: "imports", label: "Imports" },
          ] as const
        ).map((tab) => {
          const count =
            tab.id === "all"
              ? grouped.length
              : grouped.filter((i) => i.category === tab.id).length;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all",
                filter === tab.id
                  ? "bg-primary/15 text-primary font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full",
                    filter === tab.id ? "bg-primary/25 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Activity Item Stream */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Layers className="size-8 stroke-[1.25] text-muted-foreground/40 mb-2" />
          <p className="text-xs font-medium">No events in this view</p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            Activity updates will automatically appear as campaigns execute.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 overflow-y-auto max-h-[460px] pr-1 focus-visible:outline-none">
          {filtered.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="group relative flex items-start gap-3 rounded-xl border border-border/50 bg-card/40 p-3 transition-all hover:bg-accent/30 hover:border-border/80"
              >
                {/* Event Icon with tinted ring */}
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                    item.badgeColor
                  )}
                >
                  <Icon className="size-4" />
                </div>

                {/* Content details */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground tracking-tight leading-snug">
                      {item.title}
                    </p>
                    <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  {item.subtitle && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.subtitle}
                    </p>
                  )}

                  {item.link && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Link
                        href={item.link}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                      >
                        {item.linkLabel ?? "View details"}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

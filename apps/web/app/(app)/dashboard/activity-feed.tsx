"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Inbox, Mail, Rocket, Users, type LucideIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, EmptyState, SegmentedControl, cn } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  campaignId?: string | null;
  meta?: Record<string, unknown> | null;
  createdAt: string | Date;
}

type Category = "replies" | "campaigns" | "imports" | "system";
type Tone = "success" | "brand" | "info" | "destructive" | "neutral";

interface FeedItem {
  id: string;
  category: Category;
  title: string;
  subtitle?: string;
  link?: string;
  timestamp: Date;
  tone: Tone;
  icon: LucideIcon;
}

const toneClasses: Record<Tone, string> = {
  success: "bg-success-soft text-success-text",
  brand: "bg-brand-soft text-brand-text",
  info: "bg-info-soft text-info-text",
  destructive: "bg-destructive-soft text-destructive-text",
  neutral: "bg-muted text-muted-foreground",
};

/** Groups consecutive lead imports (within 15 minutes) and labels each event. */
export function groupActivity(activities: ActivityItem[]): FeedItem[] {
  const list: FeedItem[] = [];
  let batch: { count: number; batches: number; first: Date; last: Date; id: string } | null = null;

  const flush = () => {
    if (!batch) return;
    list.push({
      id: batch.id,
      category: "imports",
      title: `Imported ${batch.count.toLocaleString()} leads`,
      subtitle: batch.batches > 1 ? `In ${batch.batches} batches` : undefined,
      link: "/leads",
      timestamp: batch.first,
      tone: "info",
      icon: Users,
    });
    batch = null;
  };

  for (const act of activities) {
    const at = new Date(act.createdAt);
    const msg = act.message.toLowerCase();
    const type = act.type.toLowerCase();
    const isImport = act.type === "leads.imported" || (msg.includes("imported") && msg.includes("lead"));

    if (isImport) {
      const m = act.message.match(/imported\s+(\d+)\s+leads?/i);
      const n = m ? parseInt(m[1], 10) : 1;
      if (batch && Math.abs(batch.last.getTime() - at.getTime()) < 15 * 60 * 1000) {
        batch.count += n;
        batch.batches += 1;
        batch.last = at;
        continue;
      }
      flush();
      batch = { count: n, batches: 1, first: at, last: at, id: act.id };
      continue;
    }
    flush();

    if (type.includes("reply") || msg.includes("replied") || msg.includes("reply")) {
      list.push({ id: act.id, category: "replies", title: "New reply", subtitle: act.message, link: "/unibox", timestamp: at, tone: "success", icon: Inbox });
    } else if (type.includes("campaign") || msg.includes("campaign")) {
      list.push({
        id: act.id,
        category: "campaigns",
        title: "Campaign update",
        subtitle: act.message,
        link: act.campaignId ? `/campaigns/${act.campaignId}` : "/campaigns",
        timestamp: at,
        tone: "brand",
        icon: Rocket,
      });
    } else if (type.includes("bounce") || msg.includes("bounce") || msg.includes("failed")) {
      list.push({ id: act.id, category: "system", title: "Delivery problem", subtitle: act.message, link: "/analytics", timestamp: at, tone: "destructive", icon: AlertTriangle });
    } else if (type.includes("sender") || msg.includes("sender")) {
      list.push({ id: act.id, category: "system", title: "Mailbox activity", subtitle: act.message, link: "/senders", timestamp: at, tone: "neutral", icon: Mail });
    } else {
      list.push({ id: act.id, category: "system", title: act.message, timestamp: at, tone: "neutral", icon: Activity });
    }
  }
  flush();
  return list;
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "replies", label: "Replies" },
  { value: "campaigns", label: "Campaigns" },
  { value: "imports", label: "Imports" },
] as const;

export function ActivityFeed({ initialActivities }: { initialActivities: ActivityItem[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const grouped = useMemo(() => groupActivity(initialActivities), [initialActivities]);
  const items = filter === "all" ? grouped : grouped.filter((i) => i.category === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <div className="px-5 pt-3">
        <SegmentedControl
          size="sm"
          aria-label="Filter activity"
          value={filter}
          onValueChange={setFilter}
          options={FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          className="w-full [&>button]:flex-1"
        />
      </div>
      {items.length === 0 ? (
        <EmptyState compact icon={Activity} title="Nothing here yet" description="Sends, replies and imports appear as they happen." />
      ) : (
        <ol className="flex flex-col px-5 pb-4 pt-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            const body = (
              <div className="flex gap-3 py-2.5">
                <div className="relative flex flex-col items-center">
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", toneClasses[item.tone])}>
                    <Icon className="size-3.5" aria-hidden />
                  </span>
                  {i < items.length - 1 && <span className="absolute top-8 h-[calc(100%-12px)] w-px bg-border" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium">{item.title}</span>
                    <time className="shrink-0 text-xs text-subtle-foreground" dateTime={item.timestamp.toISOString()}>
                      {timeAgo(item.timestamp.toISOString())}
                    </time>
                  </div>
                  {item.subtitle && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{item.subtitle}</p>}
                </div>
              </div>
            );
            return (
              <li key={item.id}>
                {item.link ? (
                  <Link href={item.link} className="-mx-2 block rounded-md px-2 transition-colors hover:bg-muted/50">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

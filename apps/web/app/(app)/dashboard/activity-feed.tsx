"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Bell, Bot, Inbox, Mail, Rocket, Users, type LucideIcon } from "lucide-react";
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
type Tone = "success" | "brand" | "info" | "warning" | "destructive" | "neutral";

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
  warning: "bg-warning-soft text-warning-text",
  destructive: "bg-destructive-soft text-destructive-text",
  neutral: "bg-muted text-muted-foreground",
};

/** Where each kind of activity leads. Kept in one place so links can be made more specific. */
export const ACTIVITY_LINKS = {
  needsYou: "/requests",
  inbox: "/unibox",
  campaigns: "/campaigns",
  imports: "/campaigns#lead-lists",
  campaign: (id: string) => `/campaigns/${id}`,
} as const;

type Rule = Omit<FeedItem, "id" | "subtitle" | "link" | "timestamp"> & { link: "needsYou" | "inbox" | "campaigns" | "campaign" | null };

const NEEDS_YOU: Rule = { category: "replies", title: "Needs you", link: "needsYou", tone: "warning", icon: AlertTriangle };
const DELIVERY_PROBLEM: Rule = { category: "system", title: "Delivery problem", link: "campaigns", tone: "destructive", icon: AlertTriangle };
const CAMPAIGN_UPDATE: Rule = { category: "campaigns", title: "Campaign update", link: "campaign", tone: "brand", icon: Rocket };

/** Exact activity types: what happened, who did it, and where it leads. */
const EXACT_TYPES: Record<string, Rule> = {
  "agent.escalated": NEEDS_YOU,
  "agent.failed": NEEDS_YOU,
  "agent.reminder_digest": { category: "replies", title: "Reminder sent", link: "needsYou", tone: "neutral", icon: Bell },
  "agent.replied": { category: "replies", title: "Agent replied", link: "inbox", tone: "success", icon: Bot },
  "agent.resolved": { category: "replies", title: "You answered the agent", link: "inbox", tone: "neutral", icon: Inbox },
  "unibox.replied": { category: "replies", title: "You replied", link: "inbox", tone: "brand", icon: Inbox },
  reply_received: { category: "replies", title: "New reply", link: "inbox", tone: "success", icon: Inbox },
  out_of_office_received: { category: "replies", title: "Out of office", link: "inbox", tone: "neutral", icon: Inbox },
  email_bounced: DELIVERY_PROBLEM,
  email_failed: DELIVERY_PROBLEM,
  email_blocked: DELIVERY_PROBLEM,
  "campaign.delete": { category: "campaigns", title: "Campaign deleted", link: null, tone: "neutral", icon: Rocket },
  campaign_blocked: CAMPAIGN_UPDATE,
};

function ruleFor(type: string): Rule | null {
  return EXACT_TYPES[type] ?? (type.startsWith("campaign.") ? CAMPAIGN_UPDATE : null);
}

/**
 * A campaign's page, but only while the campaign exists: a deleted one would 404.
 * Without `liveCampaignIds` every campaign id is linked.
 */
function campaignLink(campaignId: string | null | undefined, liveCampaignIds?: ReadonlySet<string>): string | undefined {
  if (!campaignId) return ACTIVITY_LINKS.campaigns;
  if (liveCampaignIds && !liveCampaignIds.has(campaignId)) return undefined;
  return ACTIVITY_LINKS.campaign(campaignId);
}

function linkFor(rule: Rule, act: ActivityItem, liveCampaignIds?: ReadonlySet<string>): string | undefined {
  if (rule.link === null) return undefined;
  if (rule.link === "campaign") return campaignLink(act.campaignId, liveCampaignIds);
  return ACTIVITY_LINKS[rule.link];
}

/** Groups consecutive lead imports (within 15 minutes) and labels each event. */
export function groupActivity(activities: ActivityItem[], liveCampaignIds?: ReadonlySet<string>): FeedItem[] {
  const list: FeedItem[] = [];
  let batch: {
    count: number;
    batches: number;
    first: Date;
    last: Date;
    id: string;
    /** Lists the batch imported into; null once any event in it names no list. */
    listIds: Set<string> | null;
  } | null = null;

  const importListId = (act: ActivityItem): string | null => {
    const id = act.meta?.listId;
    return typeof id === "string" && id ? id : null;
  };

  const flush = () => {
    if (!batch) return;
    // One list: open it. Several (or unknown): the lead lists on Campaigns & leads.
    const onlyList = batch.listIds && batch.listIds.size === 1 ? [...batch.listIds][0] : null;
    list.push({
      id: batch.id,
      category: "imports",
      title: `Imported ${batch.count.toLocaleString()} leads`,
      subtitle: batch.batches > 1 ? `In ${batch.batches} batches` : undefined,
      link: onlyList ? `/leads/${onlyList}` : ACTIVITY_LINKS.imports,
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
      const listId = importListId(act);
      if (batch && Math.abs(batch.last.getTime() - at.getTime()) < 15 * 60 * 1000) {
        batch.count += n;
        batch.batches += 1;
        batch.last = at;
        if (batch.listIds && listId) batch.listIds.add(listId);
        else batch.listIds = null;
        continue;
      }
      flush();
      batch = { count: n, batches: 1, first: at, last: at, id: act.id, listIds: listId ? new Set([listId]) : null };
      continue;
    }
    flush();

    // Known types are labelled exactly: an agent problem is "Needs you", not a "New reply".
    const rule = ruleFor(act.type);
    if (rule) {
      const { link: _key, ...shown } = rule;
      list.push({ ...shown, id: act.id, subtitle: act.message, link: linkFor(rule, act, liveCampaignIds), timestamp: at });
      continue;
    }

    // Unknown types: best guess from the type and message.
    if (type.includes("reply") || msg.includes("replied") || msg.includes("reply")) {
      list.push({ id: act.id, category: "replies", title: "New reply", subtitle: act.message, link: ACTIVITY_LINKS.inbox, timestamp: at, tone: "success", icon: Inbox });
    } else if (type.includes("campaign") || msg.includes("campaign")) {
      list.push({
        id: act.id,
        category: "campaigns",
        title: "Campaign update",
        subtitle: act.message,
        link: campaignLink(act.campaignId, liveCampaignIds),
        timestamp: at,
        tone: "brand",
        icon: Rocket,
      });
    } else if (type.includes("bounce") || msg.includes("bounce") || msg.includes("failed")) {
      list.push({ id: act.id, category: "system", title: "Delivery problem", subtitle: act.message, link: ACTIVITY_LINKS.campaigns, timestamp: at, tone: "destructive", icon: AlertTriangle });
    } else if (type.includes("sender") || msg.includes("sender")) {
      list.push({ id: act.id, category: "system", title: "Mailbox activity", subtitle: act.message, timestamp: at, tone: "neutral", icon: Mail });
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

export function ActivityFeed({
  initialActivities,
  liveCampaignIds = [],
}: {
  initialActivities: ActivityItem[];
  /** Campaigns that still exist; other campaign ids get no link. */
  liveCampaignIds?: string[];
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const live = useMemo(() => new Set(liveCampaignIds), [liveCampaignIds]);
  const grouped = useMemo(() => groupActivity(initialActivities, live), [initialActivities, live]);
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

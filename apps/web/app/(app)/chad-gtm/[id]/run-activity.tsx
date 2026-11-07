import Link from "next/link";
import { ArrowUpRight, Bot, CircleSlash, Hourglass, MessageSquare, Send, Sparkles, UserRound, type LucideIcon } from "lucide-react";
import { Button, Card, CardDescription, CardHeader, CardTitle, EmptyState, cn } from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";

export interface RunActivityItem {
  id: string;
  type: "send" | "reply" | "open" | "agent" | "you" | "waiting" | "agent_skipped" | string;
  recipient: string;
  timestamp: string;
  detail?: string;
}

const KIND: Record<string, { icon: LucideIcon; tone: string; title: (r: string) => string }> = {
  send: { icon: Send, tone: "bg-muted text-muted-foreground", title: (r) => `Sent to ${r}` },
  reply: { icon: MessageSquare, tone: "bg-info-soft text-info-text", title: (r) => `Reply from ${r}` },
  agent: { icon: Bot, tone: "bg-brand-soft text-brand-text", title: (r) => `Agent replied to ${r}` },
  you: { icon: UserRound, tone: "bg-muted text-foreground", title: (r) => `You replied to ${r}` },
  waiting: { icon: Hourglass, tone: "bg-warning-soft text-warning-text", title: (r) => `Waiting on you: ${r}` },
  agent_skipped: { icon: CircleSlash, tone: "bg-muted text-muted-foreground", title: (r) => `Agent didn't reply to ${r}` },
  open: { icon: Send, tone: "bg-muted text-muted-foreground", title: (r) => `Opened by ${r}` },
};

/** Replies and what happened to them open their Inbox conversation; sends and opens don't. */
const CONVERSATION_TYPES = new Set(["reply", "agent", "you", "waiting", "agent_skipped"]);

export function conversationReplyId(item: Pick<RunActivityItem, "id" | "type">): string | null {
  if (!CONVERSATION_TYPES.has(item.type)) return null;
  return item.id.replace(/:agent$/, "") || null;
}

/** Empty-state copy per run state. */
const EMPTY = {
  not_launched: {
    title: "Nothing has been sent yet",
    description: "Once the campaign is live, sends, replies and the agent's answers show up here as they happen.",
  },
  live: {
    title: "First emails go out in the next sending window",
    description:
      "Emails go out Monday to Friday during business hours, spaced out across the mailbox pool. Replies and the agent's answers show up here as they happen.",
  },
  paused: {
    title: "Outreach is paused",
    description: "Nothing is sent while the run is paused. Resume it to start sending again.",
  },
} as const;

/** Latest sends, replies and agent answers for one run, newest first. */
export function RunActivity({
  items,
  state,
  campaignId = null,
}: {
  items: RunActivityItem[];
  state: keyof typeof EMPTY;
  /** The run's campaign: "Open inbox" shows only its conversations. */
  campaignId?: string | null;
}) {
  return (
    <Card>
      <CardHeader
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={campaignId ? `/unibox?campaign=${encodeURIComponent(campaignId)}` : "/unibox"}>
              Open inbox <ArrowUpRight />
            </Link>
          </Button>
        }
      >
        <CardTitle>Activity</CardTitle>
        <CardDescription>The latest 20 sends, replies and agent answers.</CardDescription>
      </CardHeader>
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={Sparkles}
          title={EMPTY[state].title}
          description={EMPTY[state].description}
        />
      ) : (
        <ol className="mt-3 divide-y divide-border border-t border-border">
          {items.map((a) => {
            const k = KIND[a.type] ?? KIND.send;
            const Icon = k.icon;
            const replyId = conversationReplyId(a);
            const body = (
              <>
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", k.tone)}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] font-medium">{k.title(a.recipient)}</span>
                    <time
                      className="shrink-0 text-xs text-subtle-foreground"
                      dateTime={a.timestamp}
                      suppressHydrationWarning
                    >
                      {timeAgo(a.timestamp)}
                    </time>
                  </div>
                  {a.detail && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted-foreground">{a.detail}</p>}
                </div>
              </>
            );
            return (
              <li key={a.id}>
                {replyId ? (
                  <Link
                    href={`/unibox?reply=${encodeURIComponent(replyId)}`}
                    className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

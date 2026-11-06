"use client";

import { useEffect, useState } from "react";
import { Eye, Mail } from "lucide-react";
import { formatDate, formatDateTime, timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  DataList,
  EmptyState,
  ErrorState,
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  statusVariant,
} from "@smartreach/ui";
import { fetchUserDetailAction } from "@/lib/admin-actions";
import type { UserDetailActivity, UserMailboxDetail } from "@/lib/admin-analytics";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "missing" }
  | { kind: "ready"; data: UserDetailActivity };

const LOADING: LoadState = { kind: "loading" };

/**
 * Side sheet with one user's mailboxes and page history. Opens when `userId`
 * is set; closing calls `onClose`.
 */
export function AdminUserDetailModal({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  // The result is tagged with the user it belongs to, so opening a different
  // user never flashes the previous user's details before the new load starts.
  const [result, setResult] = useState<{ userId: string; attempt: number; state: LoadState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchUserDetailAction(userId)
      .then((res) => {
        if (!cancelled)
          setResult({ userId, attempt, state: res ? { kind: "ready", data: res } : { kind: "missing" } });
      })
      .catch((err) => {
        console.error("Failed to load user detail:", err);
        if (!cancelled) setResult({ userId, attempt, state: { kind: "error" } });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const state: LoadState =
    result && result.userId === userId && result.attempt === attempt ? result.state : LOADING;
  const data = state.kind === "ready" ? state.data : null;

  return (
    <Sheet open={Boolean(userId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="truncate">
            {data ? data.user.name || data.user.email : state.kind === "loading" ? "Loading user" : "User details"}
          </SheetTitle>
          <SheetDescription className="truncate">
            {data ? `${data.user.email} · Joined ${formatDate(data.user.createdAt)}` : "Mailboxes and page history"}
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          {state.kind === "loading" ? (
            <DetailSkeleton />
          ) : state.kind === "error" ? (
            <ErrorState
              title="Could not load this user"
              description="Check your connection and try again."
              onRetry={() => setAttempt((n) => n + 1)}
            />
          ) : state.kind === "missing" ? (
            <EmptyState icon={Eye} title="User not found" description="This account may have been deleted." />
          ) : (
            <UserDetail data={state.data} />
          )}
        </SheetBody>

        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function UserDetail({ data }: { data: UserDetailActivity }) {
  const active = data.mailboxes.filter((m) => m.status === "active").length;
  const failing = data.mailboxes.filter((m) => m.status === "failed" || m.smtpStatus === "failed").length;

  return (
    <div className="flex flex-col gap-6">
      <DataList
        items={[
          { label: "Email", value: data.user.email },
          { label: "User ID", value: <span className="font-mono text-xs">{data.user.id}</span> },
          { label: "Joined", value: formatDateTime(data.user.createdAt) },
          {
            label: "Mailboxes",
            value:
              data.mailboxes.length === 0
                ? "None connected"
                : `${data.mailboxes.length} connected, ${active} active${failing ? `, ${failing} failing` : ""}`,
          },
          {
            label: "Recent page views",
            value: `${data.pageViews.length.toLocaleString()} across ${data.pageCounts.length.toLocaleString()} ${data.pageCounts.length === 1 ? "page" : "pages"}`,
          },
        ]}
      />

      <Tabs defaultValue="mailboxes">
        <TabsList variant="pill">
          <TabsTrigger value="mailboxes">Mailboxes ({data.mailboxes.length})</TabsTrigger>
          <TabsTrigger value="pages">Recent pages ({data.pageViews.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="mailboxes">
          {data.mailboxes.length === 0 ? (
            <EmptyState
              compact
              icon={Mail}
              title="No mailboxes connected"
              description="This user has not added a sending mailbox yet."
            />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {data.mailboxes.map((mb) => (
                <MailboxRow key={mb.id} mailbox={mb} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="pages" className="flex flex-col gap-5">
          {data.pageViews.length === 0 ? (
            <EmptyState compact icon={Eye} title="No page views" description="This user has not opened any pages yet." />
          ) : (
            <>
              <div>
                <h3 className="mb-2 text-[13px] font-medium">Most visited</h3>
                <div className="flex flex-wrap gap-1.5">
                  {data.pageCounts.map((pc) => (
                    <Badge key={pc.path} variant="neutral">
                      <span className="font-mono">{pc.path}</span>
                      <span className="tabular text-subtle-foreground">{pc.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-medium">Latest visits, newest first</h3>
                <ul className="divide-y divide-border rounded-xl border border-border text-[13px]">
                  {data.pageViews.map((pv) => (
                    <li key={pv.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-xs">{pv.path}</span>
                        {pv.pageTitle ? (
                          <span className="block truncate text-xs text-muted-foreground">{pv.pageTitle}</span>
                        ) : null}
                      </span>
                      <time
                        dateTime={pv.createdAt}
                        title={formatDateTime(pv.createdAt)}
                        className="shrink-0 text-xs text-subtle-foreground"
                      >
                        {timeAgo(pv.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function connectionVariant(status: string) {
  if (status === "ok") return "success" as const;
  if (status === "failed") return "destructive" as const;
  return "neutral" as const;
}

function MailboxRow({ mailbox: mb }: { mailbox: UserMailboxDetail }) {
  const healthTone = mb.health >= 80 ? "text-success-text" : mb.health >= 50 ? "text-warning-text" : "text-destructive-text";
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{mb.senderName || mb.email}</div>
          <div className="truncate text-xs text-muted-foreground">{mb.email}</div>
        </div>
        <Badge variant={statusVariant(mb.status)} dot className="shrink-0 capitalize">
          {mb.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="font-mono">
          {mb.smtpHost || "Custom host"}:{mb.smtpPort || 587}
        </span>
        <Badge variant={connectionVariant(mb.smtpStatus)}>SMTP {mb.smtpStatus}</Badge>
        <Badge variant={connectionVariant(mb.imapStatus)}>IMAP {mb.imapStatus}</Badge>
        <span className="tabular">{mb.dailyLimit} a day</span>
        <span className="tabular">
          Health <span className={healthTone}>{mb.health}%</span>
        </span>
      </div>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[2fr_3fr] gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-9 w-64" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
      <span className="sr-only">Loading user</span>
    </div>
  );
}

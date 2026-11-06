"use client";

import { useMemo, useState } from "react";
import { Download, Eye, FileText, KeyRound, LockKeyhole, Users } from "lucide-react";
import { formatDate, timeAgo } from "@smartreach/shared";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  NativeSelect,
  Progress,
  SegmentedControl,
  Stat,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@smartreach/ui";
import type { AdminAnalyticsPayload, UserAnalyticsSummary } from "@/lib/admin-analytics";
import { adminToggleB2bAccessAction } from "@/lib/b2b-access-actions";
import { AdminUserDetailModal } from "./admin-user-detail-modal";
import { NoMatches, Pager, RowActionsButton, SearchField, Toolbar, downloadCsv, todayStamp, withCount } from "./admin-ui";

type Filter = "all" | "has_mailboxes" | "no_mailboxes" | "active";
type Sort = "views" | "mailboxes" | "newest" | "last_active";

const PAGE_SIZE = 25;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SORTS: { value: Sort; label: string }[] = [
  { value: "views", label: "Most page views" },
  { value: "mailboxes", label: "Most mailboxes" },
  { value: "newest", label: "Newest sign-ups" },
  { value: "last_active", label: "Recently active" },
];

function isActive7d(u: UserAnalyticsSummary) {
  return !!u.lastActiveAt && Date.now() - new Date(u.lastActiveAt).getTime() <= WEEK_MS;
}

/** Users tab: platform totals, the user table with B2B access controls, and page traffic. */
export function AdminAnalyticsView({ initialAnalytics }: { initialAnalytics: AdminAnalyticsPayload }) {
  const { kpis, topRoutes, recentActivity } = initialAnalytics;
  const [users, setUsers] = useState<UserAnalyticsSummary[]>(initialAnalytics.users);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortBy, setSortBy] = useState<Sort>("views");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [b2bTarget, setB2bTarget] = useState<{ user: UserAnalyticsSummary; grant: boolean } | null>(null);
  const [b2bOpen, setB2bOpen] = useState(false);

  const counts = useMemo(
    () => ({
      all: users.length,
      has_mailboxes: users.filter((u) => u.mailboxCount > 0).length,
      no_mailboxes: users.filter((u) => u.mailboxCount === 0).length,
      active: users.filter(isActive7d).length,
    }),
    [users],
  );

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter((u) => {
      if (filter === "has_mailboxes" && u.mailboxCount === 0) return false;
      if (filter === "no_mailboxes" && u.mailboxCount > 0) return false;
      if (filter === "active" && !isActive7d(u)) return false;
      if (!q) return true;
      return u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.userId.toLowerCase().includes(q);
    });
    const time = (s: string | null) => (s ? new Date(s).getTime() : 0);
    if (sortBy === "views") list.sort((a, b) => b.totalPageViews - a.totalPageViews);
    else if (sortBy === "mailboxes") list.sort((a, b) => b.mailboxCount - a.mailboxCount);
    else if (sortBy === "newest") list.sort((a, b) => time(b.createdAt) - time(a.createdAt));
    else list.sort((a, b) => time(b.lastActiveAt) - time(a.lastActiveAt));
    return list;
  }, [users, filter, search, sortBy]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const resetFilters = () => {
    setSearch("");
    setFilter("all");
    setPage(1);
  };

  const toggleB2b = async (target: UserAnalyticsSummary, grant: boolean) => {
    try {
      const res = await adminToggleB2bAccessAction(target.userId, grant);
      if (res.success) {
        setUsers((prev) => prev.map((u) => (u.userId === target.userId ? { ...u, hasB2bAccess: grant } : u)));
        toast.success(grant ? `B2B database access granted to ${target.email}.` : `B2B database access revoked for ${target.email}.`);
      } else {
        toast.error(res.error || "Could not update B2B database access.");
      }
    } catch {
      toast.error("Could not update B2B database access.");
    }
  };

  const exportCsv = () => {
    downloadCsv(
      `smartreach-user-analytics-${todayStamp()}.csv`,
      [
        "User ID",
        "Email",
        "Name",
        "Signup Date",
        "Email Verified",
        "Total Page Views",
        "Mailboxes Count",
        "Active Mailboxes",
        "Failing Mailboxes",
        "Top Visited Routes",
        "Last Active At",
      ],
      sorted.map((u) => [
        u.userId,
        u.email,
        u.name,
        u.createdAt,
        u.emailVerified ? "Yes" : "No",
        u.totalPageViews,
        u.mailboxCount,
        u.activeMailboxes,
        u.failingMailboxes,
        u.topPages.map((p) => `${p.path} (${p.count})`).join("; "),
        u.lastActiveAt || "Never",
      ]),
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat
          bare
          label="Users"
          value={kpis.totalUsers.toLocaleString()}
          hint={`${kpis.newUsers7d.toLocaleString()} new in the last 7 days`}
        />
        <Stat
          bare
          label="Active this week"
          value={kpis.activeUsers7d.toLocaleString()}
          hint={`${kpis.activeUsersPercentage}% of users, last 7 days`}
        />
        <Stat
          bare
          label="Page views"
          value={kpis.totalPagesVisited.toLocaleString()}
          hint={`${kpis.pageViews24h.toLocaleString()} in the last 24 hours`}
        />
        <Stat
          bare
          label="User mailboxes"
          value={kpis.totalMailboxes.toLocaleString()}
          hint={`${kpis.activeMailboxes.toLocaleString()} active, ${kpis.failingMailboxes.toLocaleString()} failing`}
        />
      </Card>

      <Card>
        <CardHeader
          actions={
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={sorted.length === 0}>
              <Download />
              Export CSV
            </Button>
          }
        >
          <CardTitle>All users</CardTitle>
          <CardDescription>Open a user to see their mailboxes and page history.</CardDescription>
        </CardHeader>

        <div className="px-5 pt-4">
          <Toolbar>
            <SearchField
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search name, email or ID"
              label="Search users"
            />
            <div className="max-w-full overflow-x-auto">
              <SegmentedControl
                size="sm"
                aria-label="Filter users"
                value={filter}
                onValueChange={(v) => {
                  setFilter(v);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: withCount("All", counts.all) },
                  { value: "has_mailboxes", label: withCount("With mailboxes", counts.has_mailboxes) },
                  { value: "no_mailboxes", label: withCount("No mailboxes", counts.no_mailboxes) },
                  { value: "active", label: withCount("Active this week", counts.active) },
                ]}
              />
            </div>
            <NativeSelect
              aria-label="Sort users"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as Sort)}
              className="h-8 text-[13px] sm:w-44"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </Toolbar>
        </div>

        {users.length === 0 ? (
          <EmptyState compact icon={Users} title="No users yet" description="People who sign up appear here." />
        ) : sorted.length === 0 ? (
          <NoMatches what="users" onClear={resetFilters} />
        ) : (
          <>
            <div className="mt-4 border-t border-border">
              <Table className="min-w-[880px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>User</TableHead>
                    <TableHead>Signed up</TableHead>
                    <TableHead>Mailboxes</TableHead>
                    <TableHead className="text-right">Page views</TableHead>
                    <TableHead>Most visited</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>B2B database</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((u) => (
                    <TableRow key={u.userId}>
                      <TableCell className="max-w-[260px]">
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(u.userId)}
                          className="block max-w-full truncate text-left font-medium hover:underline"
                        >
                          {u.name || u.email}
                        </button>
                        <div className="flex items-center gap-1.5">
                          {u.name ? <span className="truncate text-xs text-muted-foreground">{u.email}</span> : null}
                          {!u.emailVerified && <Badge variant="outline">Not verified</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        <time suppressHydrationWarning dateTime={u.createdAt} title={formatDate(u.createdAt)}>
                          {timeAgo(u.createdAt)}
                        </time>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {u.mailboxCount === 0 ? (
                          <span className="text-subtle-foreground">None</span>
                        ) : (
                          <span className="tabular">
                            {u.mailboxCount}
                            {u.failingMailboxes > 0 ? (
                              <span className="ml-1.5 text-warning-text">{u.failingMailboxes} failing</span>
                            ) : null}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">{u.totalPageViews.toLocaleString()}</TableCell>
                      <TableCell className="max-w-[220px]">
                        {u.topPages.length === 0 ? (
                          <span className="text-subtle-foreground">None</span>
                        ) : (
                          <span className="block truncate font-mono text-xs text-muted-foreground" title={u.topPages.map((p) => `${p.path} (${p.count})`).join(", ")}>
                            {u.topPages
                              .slice(0, 3)
                              .map((p) => p.path)
                              .join(", ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {u.lastActiveAt ? (
                          <time suppressHydrationWarning dateTime={u.lastActiveAt}>{timeAgo(u.lastActiveAt)}</time>
                        ) : (
                          "Never"
                        )}
                      </TableCell>
                      <TableCell>
                        {u.hasB2bAccess ? (
                          <Badge variant="success" dot>
                            Has access
                          </Badge>
                        ) : (
                          <Badge variant="neutral">No access</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <RowActionsButton label={`Actions for ${u.email}`} />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setSelectedUserId(u.userId)}>
                              <Eye />
                              View details
                            </DropdownMenuItem>
                            {u.hasB2bAccess ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  destructive
                                  onSelect={() => {
                                    setB2bTarget({ user: u, grant: false });
                                    setB2bOpen(true);
                                  }}
                                >
                                  <LockKeyhole />
                                  Revoke B2B database access
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => {
                                  setB2bTarget({ user: u, grant: true });
                                  setB2bOpen(true);
                                }}
                              >
                                <KeyRound />
                                Grant B2B database access
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={currentPage} pageSize={PAGE_SIZE} total={sorted.length} onPageChange={setPage} noun="users" />
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopPagesCard routes={topRoutes} />
        <RecentViewsCard items={recentActivity} onOpenUser={setSelectedUserId} />
      </div>

      <ConfirmDialog
        open={b2bOpen}
        onOpenChange={setB2bOpen}
        title={
          b2bTarget?.grant
            ? `Give ${b2bTarget.user.email} B2B database access?`
            : `Revoke B2B database access for ${b2bTarget?.user.email ?? "this user"}?`
        }
        description={
          b2bTarget?.grant
            ? "They can search and export leads from the B2B database without paying. You can revoke this later."
            : "They lose access to the B2B database straight away, including any access they paid for."
        }
        confirmLabel={b2bTarget?.grant ? "Grant access" : "Revoke access"}
        destructive={!b2bTarget?.grant}
        onConfirm={async () => {
          if (b2bTarget) await toggleB2b(b2bTarget.user, b2bTarget.grant);
        }}
      />

      <AdminUserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </div>
  );
}

function TopPagesCard({ routes }: { routes: AdminAnalyticsPayload["topRoutes"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Most visited pages</CardTitle>
        <CardDescription>Share of all page views by route.</CardDescription>
      </CardHeader>
      {routes.length === 0 ? (
        <EmptyState compact icon={FileText} title="No page views yet" description="Pages appear here once people use the app." />
      ) : (
        <ul className="flex flex-col gap-3.5 p-5">
          {routes.map((r) => (
            <li key={r.path} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-xs">{r.path}</span>
                  {r.title ? <span className="ml-2 text-muted-foreground">{r.title}</span> : null}
                </span>
                <span className="tabular shrink-0 text-muted-foreground">
                  <span className="font-medium text-foreground">{r.count.toLocaleString()}</span> · {r.percentage}%
                </span>
              </div>
              <Progress value={r.percentage} aria-label={`${r.path}: ${r.percentage}% of page views`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentViewsCard({
  items,
  onOpenUser,
}: {
  items: AdminAnalyticsPayload["recentActivity"];
  onOpenUser: (userId: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent page views</CardTitle>
        <CardDescription>The latest pages people opened.</CardDescription>
      </CardHeader>
      {items.length === 0 ? (
        <EmptyState compact icon={Eye} title="No page views yet" description="Page views appear here as people use the app." />
      ) : (
        <ul className="mt-3 max-h-[360px] divide-y divide-border overflow-y-auto border-t border-border">
          {items.map((a) => {
            // Signed-out visits have no account to open.
            const anonymous = a.userId === "anonymous";
            const body = (
              <>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                  {anonymous ? "?" : (a.userName || a.userEmail || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {anonymous ? "Signed-out visitor" : a.userEmail}
                  </span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">{a.path}</span>
                </span>
                <time suppressHydrationWarning dateTime={a.createdAt} className="shrink-0 text-xs text-subtle-foreground">
                  {timeAgo(a.createdAt)}
                </time>
              </>
            );
            return (
              <li key={a.id}>
                {anonymous ? (
                  <div className="flex w-full items-center gap-3 px-5 py-2.5">{body}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenUser(a.userId)}
                    className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/50"
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

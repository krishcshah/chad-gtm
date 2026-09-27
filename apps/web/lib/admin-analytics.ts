import { desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { requireAdmin, isAdminEmail } from "./admin";
import { getAllB2bAccessMap } from "./b2b-access";

export interface UserAnalyticsSummary {
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  emailVerified: boolean;
  totalPageViews: number;
  mailboxCount: number;
  activeMailboxes: number;
  failingMailboxes: number;
  topPages: { path: string; count: number }[];
  lastActiveAt: string | null;
  hasB2bAccess: boolean;
}

export interface AdminAnalyticsKPIs {
  totalUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  totalPagesVisited: number;
  pageViews24h: number;
  pageViews7d: number;
  avgPagesPerUser: number;
  totalMailboxes: number;
  activeMailboxes: number;
  failingMailboxes: number;
  avgMailboxesPerUser: number;
  activeUsers7d: number;
  activeUsersPercentage: number;
}

export interface RouteShare {
  path: string;
  title: string;
  count: number;
  percentage: number;
}

export interface ActivityItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  path: string;
  pageTitle: string | null;
  createdAt: string;
}

export interface AdminAnalyticsPayload {
  kpis: AdminAnalyticsKPIs;
  users: UserAnalyticsSummary[];
  topRoutes: RouteShare[];
  recentActivity: ActivityItem[];
}

export interface UserMailboxDetail {
  id: string;
  senderName: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  status: string;
  smtpStatus: string;
  imapStatus: string;
  health: number;
  dailyLimit: number;
  hourlyLimit: number;
  createdAt: string;
}

export interface UserDetailActivity {
  user: {
    id: string;
    email: string;
    name: string;
    createdAt: string;
  };
  mailboxes: UserMailboxDetail[];
  pageViews: {
    id: string;
    path: string;
    pageTitle: string | null;
    referrer: string | null;
    userAgent: string | null;
    createdAt: string;
  }[];
  pageCounts: { path: string; count: number }[];
}

/**
 * Aggregates complete analytics for the admin user behavior dashboard.
 */
export async function getAdminUserAnalytics(
  adminUser: { email?: string | null } | null
): Promise<AdminAnalyticsPayload> {
  requireAdmin(adminUser);
  const db = getDb();

  // 1. Fetch all users
  const rawUsers = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      emailVerified: schema.users.emailVerified,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));

  // 2. Fetch all active mailboxes (sender_accounts)
  const rawSenders = await db
    .select({
      id: schema.senderAccounts.id,
      userId: schema.senderAccounts.userId,
      email: schema.senderAccounts.email,
      status: schema.senderAccounts.status,
      smtpStatus: schema.senderAccounts.smtpStatus,
      imapStatus: schema.senderAccounts.imapStatus,
      health: schema.senderAccounts.health,
    })
    .from(schema.senderAccounts)
    .where(isNull(schema.senderAccounts.deletedAt));

  // 3. Fetch all page views
  const rawPageViews = await db
    .select({
      id: schema.pageViews.id,
      userId: schema.pageViews.userId,
      path: schema.pageViews.path,
      pageTitle: schema.pageViews.pageTitle,
      createdAt: schema.pageViews.createdAt,
    })
    .from(schema.pageViews)
    .orderBy(desc(schema.pageViews.createdAt));

  const nowMs = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;
  const ms30d = 30 * ms24h;

  // Aggregate user signups
  let newUsers24h = 0;
  let newUsers7d = 0;
  let newUsers30d = 0;

  for (const u of rawUsers) {
    const createdTime = u.createdAt ? new Date(u.createdAt).getTime() : 0;
    const diff = nowMs - createdTime;
    if (diff <= ms24h) newUsers24h++;
    if (diff <= ms7d) newUsers7d++;
    if (diff <= ms30d) newUsers30d++;
  }

  // Aggregate Mailboxes by userId
  const mailboxMap = new Map<
    string,
    { total: number; active: number; failing: number }
  >();
  let totalActiveMailboxes = 0;
  let totalFailingMailboxes = 0;

  for (const s of rawSenders) {
    const cur = mailboxMap.get(s.userId) || { total: 0, active: 0, failing: 0 };
    cur.total++;
    const isFailing =
      s.status === "failed" ||
      s.smtpStatus === "failed" ||
      s.imapStatus === "failed";
    if (isFailing) {
      cur.failing++;
      totalFailingMailboxes++;
    } else if (s.status === "active") {
      cur.active++;
      totalActiveMailboxes++;
    }
    mailboxMap.set(s.userId, cur);
  }

  // Aggregate Page Views by userId & path
  let pageViews24h = 0;
  let pageViews7d = 0;
  const activeUserIds7d = new Set<string>();

  const userPageViewMap = new Map<
    string,
    {
      total: number;
      paths: Map<string, number>;
      lastActive: string | null;
    }
  >();

  const routeMap = new Map<string, { count: number; title: string }>();

  for (const pv of rawPageViews) {
    const createdTime = pv.createdAt ? new Date(pv.createdAt).getTime() : 0;
    const diff = nowMs - createdTime;
    if (diff <= ms24h) pageViews24h++;
    if (diff <= ms7d) {
      pageViews7d++;
      if (pv.userId) activeUserIds7d.add(pv.userId);
    }

    // Platform route stats
    const rKey = pv.path;
    const rCur = routeMap.get(rKey) || { count: 0, title: pv.pageTitle || rKey };
    rCur.count++;
    if (pv.pageTitle && !rCur.title) rCur.title = pv.pageTitle;
    routeMap.set(rKey, rCur);

    // Per user stats
    if (pv.userId) {
      const uCur = userPageViewMap.get(pv.userId) || {
        total: 0,
        paths: new Map<string, number>(),
        lastActive: null,
      };
      uCur.total++;
      if (!uCur.lastActive || pv.createdAt > uCur.lastActive) {
        uCur.lastActive = pv.createdAt;
      }
      const pCount = uCur.paths.get(pv.path) || 0;
      uCur.paths.set(pv.path, pCount + 1);
      userPageViewMap.set(pv.userId, uCur);
    }
  }

  // Assemble Per-User Analytics
  const b2bAccessMap = await getAllB2bAccessMap();

  const userSummaries: UserAnalyticsSummary[] = rawUsers.map((u) => {
    const mb = mailboxMap.get(u.id) || { total: 0, active: 0, failing: 0 };
    const pv = userPageViewMap.get(u.id) || {
      total: 0,
      paths: new Map<string, number>(),
      lastActive: null,
    };

    // Sort user's top pages
    const topPages = Array.from(pv.paths.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const hasB2b =
      isAdminEmail(u.email) ||
      u.email.toLowerCase() === "demo@ratecompany.com" ||
      Boolean(b2bAccessMap[u.id]);

    return {
      userId: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      emailVerified: Boolean(u.emailVerified),
      totalPageViews: pv.total,
      mailboxCount: mb.total,
      activeMailboxes: mb.active,
      failingMailboxes: mb.failing,
      topPages,
      lastActiveAt: pv.lastActive,
      hasB2bAccess: hasB2b,
    };
  });

  // Sort default: users with most page views first
  userSummaries.sort((a, b) => b.totalPageViews - a.totalPageViews);

  // Platform top routes
  const totalViews = rawPageViews.length || 1;
  const topRoutes: RouteShare[] = Array.from(routeMap.entries())
    .map(([path, data]) => ({
      path,
      title: data.title,
      count: data.count,
      percentage: Math.round((data.count / totalViews) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Recent Activity Feed
  const userEmailMap = new Map<string, { email: string; name: string }>();
  for (const u of rawUsers) {
    userEmailMap.set(u.id, { email: u.email, name: u.name });
  }

  const recentActivity: ActivityItem[] = rawPageViews.slice(0, 20).map((pv) => {
    const info = pv.userId ? userEmailMap.get(pv.userId) : null;
    return {
      id: pv.id,
      userId: pv.userId || "anonymous",
      userEmail: info?.email || "Anonymous Visitor",
      userName: info?.name || "Visitor",
      path: pv.path,
      pageTitle: pv.pageTitle,
      createdAt: pv.createdAt,
    };
  });

  const totalUsers = rawUsers.length;
  const totalPagesVisited = rawPageViews.length;
  const totalMailboxes = rawSenders.length;

  const kpis: AdminAnalyticsKPIs = {
    totalUsers,
    newUsers24h,
    newUsers7d,
    newUsers30d,
    totalPagesVisited,
    pageViews24h,
    pageViews7d,
    avgPagesPerUser: totalUsers > 0 ? Math.round(totalPagesVisited / totalUsers) : 0,
    totalMailboxes,
    activeMailboxes: totalActiveMailboxes,
    failingMailboxes: totalFailingMailboxes,
    avgMailboxesPerUser: totalUsers > 0 ? Number((totalMailboxes / totalUsers).toFixed(1)) : 0,
    activeUsers7d: activeUserIds7d.size,
    activeUsersPercentage: totalUsers > 0 ? Math.round((activeUserIds7d.size / totalUsers) * 100) : 0,
  };

  return {
    kpis,
    users: userSummaries,
    topRoutes,
    recentActivity,
  };
}

/**
 * Returns deep-dive user activity for the inspection modal.
 */
export async function getUserDetailedActivity(
  adminUser: { email?: string | null } | null,
  targetUserId: string
): Promise<UserDetailActivity | null> {
  requireAdmin(adminUser);
  const db = getDb();

  const [targetUser] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, targetUserId))
    .limit(1);

  if (!targetUser) return null;

  const mailboxes = await db
    .select({
      id: schema.senderAccounts.id,
      senderName: schema.senderAccounts.senderName,
      email: schema.senderAccounts.email,
      smtpHost: schema.senderAccounts.smtpHost,
      smtpPort: schema.senderAccounts.smtpPort,
      status: schema.senderAccounts.status,
      smtpStatus: schema.senderAccounts.smtpStatus,
      imapStatus: schema.senderAccounts.imapStatus,
      health: schema.senderAccounts.health,
      dailyLimit: schema.senderAccounts.dailyLimit,
      hourlyLimit: schema.senderAccounts.hourlyLimit,
      createdAt: schema.senderAccounts.createdAt,
    })
    .from(schema.senderAccounts)
    .where(
      sql`${schema.senderAccounts.userId} = ${targetUserId} AND ${schema.senderAccounts.deletedAt} IS NULL`
    )
    .orderBy(desc(schema.senderAccounts.createdAt));

  const pageViews = await db
    .select({
      id: schema.pageViews.id,
      path: schema.pageViews.path,
      pageTitle: schema.pageViews.pageTitle,
      referrer: schema.pageViews.referrer,
      userAgent: schema.pageViews.userAgent,
      createdAt: schema.pageViews.createdAt,
    })
    .from(schema.pageViews)
    .where(eq(schema.pageViews.userId, targetUserId))
    .orderBy(desc(schema.pageViews.createdAt))
    .limit(60);

  // Group page counts
  const pageMap = new Map<string, number>();
  for (const pv of pageViews) {
    pageMap.set(pv.path, (pageMap.get(pv.path) || 0) + 1);
  }
  const pageCounts = Array.from(pageMap.entries())
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count);

  return {
    user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      createdAt: targetUser.createdAt ? new Date(targetUser.createdAt).toISOString() : new Date().toISOString(),
    },
    mailboxes,
    pageViews,
    pageCounts,
  };
}

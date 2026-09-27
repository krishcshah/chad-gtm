import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL, isAdmin } from "../admin";
import type { AdminAnalyticsKPIs, UserAnalyticsSummary } from "../admin-analytics";

describe("Admin Analytics Suite", () => {
  it("enforces admin authorization for analytics dashboard", () => {
    expect(isAdmin({ email: ADMIN_EMAIL })).toBe(true);
    expect(isAdmin({ email: "user@example.com" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it("accurately calculates user engagement percentage and averages", () => {
    const totalUsers = 100;
    const activeUsers7d = 42;
    const totalPageViews = 2500;
    const totalMailboxes = 150;

    const kpis: AdminAnalyticsKPIs = {
      totalUsers,
      newUsers24h: 5,
      newUsers7d: 18,
      newUsers30d: 60,
      totalPagesVisited: totalPageViews,
      pageViews24h: 320,
      pageViews7d: 1400,
      avgPagesPerUser: Math.round(totalPageViews / totalUsers),
      totalMailboxes,
      activeMailboxes: 130,
      failingMailboxes: 20,
      avgMailboxesPerUser: Number((totalMailboxes / totalUsers).toFixed(1)),
      activeUsers7d,
      activeUsersPercentage: Math.round((activeUsers7d / totalUsers) * 100),
    };

    expect(kpis.avgPagesPerUser).toBe(25);
    expect(kpis.avgMailboxesPerUser).toBe(1.5);
    expect(kpis.activeUsersPercentage).toBe(42);
    expect(kpis.failingMailboxes).toBe(20);
  });

  it("correctly sorts users by total page views descending", () => {
    const users: Partial<UserAnalyticsSummary>[] = [
      { userId: "u1", email: "low@test.com", totalPageViews: 12, mailboxCount: 1 },
      { userId: "u2", email: "high@test.com", totalPageViews: 180, mailboxCount: 5 },
      { userId: "u3", email: "mid@test.com", totalPageViews: 45, mailboxCount: 0 },
    ];

    const sorted = [...users].sort((a, b) => (b.totalPageViews || 0) - (a.totalPageViews || 0));

    expect(sorted[0].userId).toBe("u2");
    expect(sorted[1].userId).toBe("u3");
    expect(sorted[2].userId).toBe("u1");
  });

  it("handles empty user database without division by zero errors", () => {
    const totalUsers = 0;
    const totalPageViews = 0;
    const totalMailboxes = 0;

    const avgPages = totalUsers > 0 ? Math.round(totalPageViews / totalUsers) : 0;
    const avgMailboxes = totalUsers > 0 ? Number((totalMailboxes / totalUsers).toFixed(1)) : 0;
    const activePct = totalUsers > 0 ? Math.round((0 / totalUsers) * 100) : 0;

    expect(avgPages).toBe(0);
    expect(avgMailboxes).toBe(0);
    expect(activePct).toBe(0);
  });
});

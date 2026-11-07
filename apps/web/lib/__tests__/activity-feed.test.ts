import { describe, expect, it } from "vitest";
import { groupActivity, type ActivityItem } from "@/app/(app)/dashboard/activity-feed";

const imported = (id: string, minute: number, listId?: string): ActivityItem => ({
  id,
  type: "leads.imported",
  message: "Imported 5 leads",
  meta: listId ? { listId } : {},
  createdAt: `2026-11-06T12:${String(minute).padStart(2, "0")}:00.000Z`,
});

describe("Overview import activity links", () => {
  it("opens the list when every import in the batch went to one list", () => {
    const [item] = groupActivity([imported("1", 10, "list-a"), imported("2", 12, "list-a")]);
    expect(item.title).toBe("Imported 10 leads");
    expect(item.link).toBe("/leads/list-a");
  });

  it("goes to the lead lists on Campaigns & leads when the batch spans several lists", () => {
    const [item] = groupActivity([imported("1", 10, "list-a"), imported("2", 12, "list-b")]);
    expect(item.link).toBe("/campaigns#lead-lists");
  });

  it("goes to the lead lists when an import names no list", () => {
    const [item] = groupActivity([imported("1", 10)]);
    expect(item.link).toBe("/campaigns#lead-lists");
    const [mixed] = groupActivity([imported("1", 10, "list-a"), imported("2", 12)]);
    expect(mixed.link).toBe("/campaigns#lead-lists");
  });
});

describe("Overview activity labels and links (#97)", () => {
  const act = (type: string, message: string, campaignId: string | null = null): ActivityItem => ({
    id: `${type}-${campaignId ?? "none"}`,
    type,
    message,
    campaignId,
    createdAt: "2026-11-06T12:00:00.000Z",
  });
  const one = (a: ActivityItem, live?: ReadonlySet<string>) => groupActivity([a], live)[0]!;

  it("labels an agent problem as Needs you, even when the message mentions a reply", () => {
    const item = one(act("agent.failed", "Agent couldn't handle a reply from ada@example.com; it's waiting for you", "c1"));
    expect(item.title).toBe("Needs you");
    expect(item.link).toBe("/requests");
    expect(item.tone).toBe("warning");
    expect(item.category).toBe("replies");
  });

  it("links agent escalations to Needs you", () => {
    const item = one(act("agent.escalated", "Agent needs you: pricing question"));
    expect(item.title).toBe("Needs you");
    expect(item.link).toBe("/requests");
  });

  it("labels who wrote each reply", () => {
    expect(one(act("agent.replied", "Replied to ada@example.com")).title).toBe("Agent replied");
    expect(one(act("unibox.replied", "Replied to ada@example.com")).title).toBe("You replied");
    expect(one(act("agent.resolved", "Answered the agent")).title).toBe("You answered the agent");
    expect(one(act("reply_received", "Ada replied")).title).toBe("New reply");
    expect(one(act("out_of_office_received", "Ada is away")).title).toBe("Out of office");
    expect(one(act("agent.reminder_digest", "Sent a reminder")).link).toBe("/requests");
  });

  it("gives a deleted campaign no link", () => {
    const item = one(act("campaign.delete", 'Deleted campaign "Spring"', "c1"), new Set(["c1"]));
    expect(item.title).toBe("Campaign deleted");
    expect(item.link).toBeUndefined();
  });

  it("links a campaign update only while the campaign still exists", () => {
    const pause = act("campaign.pause", 'Paused campaign "Spring"', "c1");
    expect(one(pause, new Set(["c2"])).link).toBeUndefined();
    expect(one(pause, new Set(["c1"])).link).toBe("/campaigns/c1");
    expect(one(pause, new Set(["c1"])).title).toBe("Campaign update");
    // Without the set, links stay as they were.
    expect(one(pause).link).toBe("/campaigns/c1");
    expect(one(act("campaign_blocked", "Sending stopped", "c3"), new Set()).link).toBeUndefined();
  });

  it("labels delivery problems by type", () => {
    for (const type of ["email_bounced", "email_failed", "email_blocked"]) {
      const item = one(act(type, "Bounced: ada@example.com"));
      expect(item.title).toBe("Delivery problem");
      expect(item.link).toBe("/campaigns");
      expect(item.tone).toBe("destructive");
    }
  });
});

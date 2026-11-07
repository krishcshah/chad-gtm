import { describe, expect, it } from "vitest";
import type { UniboxThreadMessage } from "../unibox-thread";
import { messageAuthor, replyStatusBadge } from "@/app/(app)/unibox/inbox-utils";
import { groupActivity } from "@/app/(app)/dashboard/activity-feed";
import { activityTypeForAgentStatus, countReplyAuthors, replyAuthorsHint } from "../lead-conversations";

/* Every reply says who actually wrote it: you, the agent, or an agent draft
 * you approved. Counts and activity never credit your replies to the agent. */

function msg(over: Partial<UniboxThreadMessage>): UniboxThreadMessage {
  return {
    id: "operator:m1",
    direction: "operator",
    fromRole: "operator",
    fromName: "Alex Kim",
    fromEmail: "alex@pool.example",
    subject: "Re: idea",
    bodyHtml: "",
    bodyText: "Hi",
    sentAt: "2026-11-06T12:00:00.000Z",
    ...over,
  };
}

describe("messageAuthor labels", () => {
  it("your own message is 'You'", () => {
    expect(messageAuthor(msg({ fromRole: "operator" }))).toMatchObject({ role: "you", label: "You" });
  });
  it("the agent's own message is 'Agent'", () => {
    expect(messageAuthor(msg({ fromRole: "agent" }))).toMatchObject({ role: "agent", label: "Agent" });
  });
  it("an agent draft you approved is 'Agent, approved by you'", () => {
    expect(messageAuthor(msg({ fromRole: "agent", approvedByUser: true }))).toMatchObject({
      role: "agent",
      label: "Agent, approved by you",
    });
  });
  it("the lead has no badge", () => {
    expect(messageAuthor(msg({ direction: "inbound", fromRole: "lead", fromName: "Dana" })).label).toBeNull();
  });
});

describe("conversation list badges", () => {
  it("tell your replies from the agent's", () => {
    expect(replyStatusBadge("human_replied")?.label).toBe("You replied");
    expect(replyStatusBadge("replied")?.label).toBe("Agent replied");
    expect(replyStatusBadge("pending")?.label).toBe("Agent replying");
    expect(replyStatusBadge("processing")?.label).toBe("Agent replying");
    expect(replyStatusBadge("skipped")).toBeNull();
    expect(replyStatusBadge(null)).toBeNull();
  });
});

describe("Mission control reply counts", () => {
  const rows = [
    { fromRole: "agent", approvedByUser: false, n: "3" },
    { fromRole: "agent", approvedByUser: true, n: 2 },
    { fromRole: "operator", approvedByUser: false, n: 4 },
  ];
  it("'by the agent' counts only the agent's own sends", () => {
    expect(countReplyAuthors(rows)).toEqual({ agent: 3, approved: 2, you: 4 });
  });
  it("hint names each author and leaves out zeros", () => {
    expect(replyAuthorsHint({ agent: 3, approved: 2, you: 4 })).toBe("3 by the agent · 2 approved by you · 4 by you");
    expect(replyAuthorsHint({ agent: 0, approved: 0, you: 2 })).toBe("2 by you");
    expect(replyAuthorsHint({ agent: 0, approved: 0, you: 0 })).toBe("None answered yet");
  });
  it("run activity maps each reply status to who acted", () => {
    expect(activityTypeForAgentStatus("replied")).toBe("agent");
    expect(activityTypeForAgentStatus("human_replied")).toBe("you");
    expect(activityTypeForAgentStatus("escalated")).toBe("waiting");
    expect(activityTypeForAgentStatus("skipped")).toBe("agent_skipped");
    expect(activityTypeForAgentStatus("failed")).toBe("agent_skipped");
    expect(activityTypeForAgentStatus("pending")).toBeNull();
  });
});

describe("Overview activity titles", () => {
  const at = "2026-11-06T12:00:00.000Z";
  it("names who wrote by the exact activity type", () => {
    const items = groupActivity([
      { id: "1", type: "reply_received", message: "Reply from dana@acme.com", createdAt: at },
      { id: "2", type: "unibox.replied", message: "Replied to dana@acme.com", createdAt: at },
      { id: "3", type: "agent.replied", message: "Agent replied to dana@acme.com: booking link", createdAt: at },
      { id: "4", type: "agent.resolved", message: "You unblocked the agent for dana@acme.com", createdAt: at },
    ]);
    expect(items.map((i) => i.title)).toEqual(["New reply", "You replied", "Agent replied", "You answered the agent"]);
  });
});

import { describe, expect, it } from "vitest";
import { schema } from "@smartreach/database";
import {
  HAND_BACK_LABEL,
  HANDLER_CHIP_LABEL,
  LEAD_CONVERSATIONS_LABEL,
  MODE_LABEL,
  SETTING_LABEL,
  TAKE_OVER_LABEL,
  TAKEN_OVER_TOAST,
  effectiveLabel,
  handledByLabel,
} from "../lead-conversations";
import { conversationKey, loadConversationHandlers } from "../lead-conversations-server";

describe("Lead conversations wording (binding names)", () => {
  it("uses exactly the agreed names", () => {
    expect(LEAD_CONVERSATIONS_LABEL).toBe("Lead conversations");
    expect(MODE_LABEL).toEqual({ agent: "Agent", approve: "Agent drafts, you approve", manual: "Manual" });
    expect(SETTING_LABEL.default).toBe("Use workspace default");
    expect(HANDLER_CHIP_LABEL).toEqual({ agent: "Agent", approve: "Agent drafts", you: "You" });
    expect(handledByLabel("agent")).toBe("Handled by: Agent");
    expect(handledByLabel("approve")).toBe("Handled by: Agent drafts");
    expect(handledByLabel("you")).toBe("Handled by: You");
    expect(TAKE_OVER_LABEL).toBe("Take over");
    expect(HAND_BACK_LABEL).toBe("Hand back to agent");
    expect(TAKEN_OVER_TOAST).toBe("You've taken over; the agent won't reply here.");
  });

  it("shows the mode in effect and where it comes from", () => {
    expect(effectiveLabel({ mode: "agent", downgraded: false, missing: [] }, "default")).toBe("Agent (from workspace default)");
    expect(effectiveLabel({ mode: "manual", downgraded: false, missing: [] }, "manual")).toBe("Manual");
    expect(effectiveLabel({ mode: "approve", downgraded: true, missing: ["booking link"] }, "agent")).toBe(
      "Agent drafts, you approve (missing booking link)",
    );
    expect(
      effectiveLabel({ mode: "approve", downgraded: true, missing: ["business profile", "main offer"] }, "default"),
    ).toBe("Agent drafts, you approve (from workspace default; missing business profile and main offer)");
  });
});

/* ─── loadConversationHandlers (batch, one query per table) ───────────── */

function fakeDb(routes: Map<unknown, any[]>) {
  const calls: unknown[] = [];
  const chain = (): any => {
    let table: unknown;
    const c: any = {
      from: (t: unknown) => {
        calls.push(t);
        table = t;
        return c;
      },
      where: () => c,
      then: (resolve: any, reject: any) => Promise.resolve(routes.get(table) ?? []).then(resolve, reject),
    };
    return c;
  };
  return { db: { select: () => chain() }, calls };
}

const GROUNDED_RUN = {
  campaignId: "c1",
  bookingUrl: "https://cal.example/x",
  businessOverview: { summary: "We automate reporting." },
  offers: [{ title: "Audit", valueProp: "Find a week of work" }],
};

describe("loadConversationHandlers", () => {
  it("resolves each conversation once, with take-over and hand-back", async () => {
    const { db, calls } = fakeDb(
      new Map<unknown, any[]>([
        [
          schema.campaigns,
          [
            { id: "c1", workspaceId: "w1", leadConversationMode: "agent", agentOffer: "" },
            { id: "c2", workspaceId: "w1", leadConversationMode: "manual", agentOffer: "" },
            { id: "c3", workspaceId: "w1", leadConversationMode: "default", agentOffer: "" },
          ],
        ],
        [schema.chadGtmRuns, [GROUNDED_RUN]],
        [schema.workspaces, [{ id: "w1", isDefault: true, leadConversationMode: "approve", agentPaused: false, companySummary: "", mainOffer: "", bookingUrl: null }]],
        [
          schema.leadConversations,
          [
            { leadId: "l2", campaignId: "c1", handler: "you" },
            { leadId: "l3", campaignId: "c2", handler: "you" },
          ],
        ],
        [schema.agentRequests, [{ id: "req-1", leadId: "l1", campaignId: "c1", createdAt: "2026-11-06T10:00:00.000Z" }]],
      ]),
    );
    const views = await loadConversationHandlers(db, "u1", [
      { leadId: "l1", campaignId: "c1" },
      { leadId: "l1", campaignId: "c1" },
      { leadId: "l2", campaignId: "c1" },
      { leadId: "l3", campaignId: "c2" },
      { leadId: "l4", campaignId: "c3" },
      { leadId: "l5", campaignId: null },
    ]);
    expect(calls).toHaveLength(5);
    expect(views.get(conversationKey("l1", "c1"))).toMatchObject({ handledBy: "agent", openRequestId: "req-1", canHandBack: false });
    expect(views.get(conversationKey("l2", "c1"))).toMatchObject({ handledBy: "you", reason: "conversation", canHandBack: true });
    // Taken over on a Manual campaign: nothing to hand back to.
    expect(views.get(conversationKey("l3", "c2"))).toMatchObject({ handledBy: "you", canHandBack: false });
    expect(views.get(conversationKey("l4", "c3"))).toMatchObject({ handledBy: "approve", reason: "workspace" });
    expect(views.get(conversationKey("l5", null))).toMatchObject({ handledBy: "you", reason: "no_campaign" });
  });
});

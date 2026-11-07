import { beforeEach, describe, expect, it, vi } from "vitest";
import { schema } from "@smartreach/database";

const engine = vi.hoisted(() => ({
  addSuppression: vi.fn(async () => undefined),
  setLeadStatusForEmail: vi.fn(async () => undefined),
  stopAllCampaignsForEmail: vi.fn(async () => ({ markReplied: [], cancel: [] })),
}));
vi.mock("@smartreach/email-engine/suppression", () => ({ addSuppression: engine.addSuppression }));
vi.mock("@smartreach/email-engine/lead-outcomes", () => ({
  setLeadStatusForEmail: engine.setLeadStatusForEmail,
  stopAllCampaignsForEmail: engine.stopAllCampaignsForEmail,
}));

import {
  applyReplyTagEffects,
  leadStatusForTag,
  NOT_INTERESTED_AGENT_SUMMARY,
  TAG_OVERWRITABLE_LEAD_STATUSES,
} from "../reply-tag-effects";

function fakeDb() {
  const writes: { table: unknown; set?: any }[] = [];
  const db: any = {
    update: (table: unknown) => {
      const entry: { table: unknown; set?: any } = { table };
      writes.push(entry);
      const chain: any = {
        set: (s: any) => {
          entry.set = s;
          return chain;
        },
        where: async () => undefined,
      };
      return chain;
    },
  };
  return { db, writes };
}

const base = {
  ownerId: "u1",
  workspaceId: "w1",
  leadId: "l1",
  fromEmail: "Dana@Acme.com",
  stopContacting: false,
  nowIso: "2026-11-07T00:00:00.000Z",
};

beforeEach(() => {
  engine.addSuppression.mockClear();
  engine.setLeadStatusForEmail.mockClear();
  engine.stopAllCampaignsForEmail.mockClear();
});

describe("leadStatusForTag", () => {
  it("maps tags to the lead funnel", () => {
    expect(leadStatusForTag("interested")).toBe("interested");
    expect(leadStatusForTag("meeting_booked")).toBe("meeting_booked");
    expect(leadStatusForTag("won")).toBe("won");
    expect(leadStatusForTag("lost")).toBe("lost");
    expect(leadStatusForTag("not_interested")).toBe("lost");
    expect(leadStatusForTag("out_of_office")).toBeNull();
    expect(leadStatusForTag(null)).toBeNull();
  });

  it("never overwrites bounced, unsubscribed or blocked", () => {
    for (const s of ["bounced", "unsubscribed", "blocked"]) {
      expect(TAG_OVERWRITABLE_LEAD_STATUSES as readonly string[]).not.toContain(s);
    }
  });
});

describe("applyReplyTagEffects", () => {
  it("out of office is a label only", async () => {
    const { db, writes } = fakeDb();
    const out = await applyReplyTagEffects(db, { ...base, tag: "out_of_office" });
    expect(out.stopped).toBe(false);
    expect(engine.setLeadStatusForEmail).not.toHaveBeenCalled();
    expect(engine.addSuppression).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("won updates the owner's rows for that address, never sticky statuses", async () => {
    const { db } = fakeDb();
    await applyReplyTagEffects(db, { ...base, tag: "won" });
    expect(engine.setLeadStatusForEmail).toHaveBeenCalledWith(db, {
      ownerId: "u1",
      email: "dana@acme.com",
      status: "won",
      nowIso: base.nowIso,
      onlyFrom: [...TAG_OVERWRITABLE_LEAD_STATUSES],
    });
    expect(engine.stopAllCampaignsForEmail).not.toHaveBeenCalled();
  });

  it("not interested without 'stop contacting' marks Lost but stops nothing", async () => {
    const { db, writes } = fakeDb();
    const out = await applyReplyTagEffects(db, { ...base, tag: "not_interested" });
    expect(out.stopped).toBe(false);
    expect(engine.setLeadStatusForEmail).toHaveBeenCalledWith(db, expect.objectContaining({ status: "lost" }));
    expect(engine.addSuppression).not.toHaveBeenCalled();
    expect(engine.stopAllCampaignsForEmail).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("not interested + stop contacting blocklists, stops every campaign and the agent", async () => {
    const { db, writes } = fakeDb();
    const out = await applyReplyTagEffects(db, { ...base, tag: "not_interested", stopContacting: true });
    expect(out.stopped).toBe(true);
    expect(engine.addSuppression).toHaveBeenCalledWith(db, {
      userId: "u1",
      workspaceId: "w1",
      email: "dana@acme.com",
      source: "not_interested",
      reason: "Tagged Not interested in the Inbox",
    });
    expect(engine.stopAllCampaignsForEmail).toHaveBeenCalledWith(db, {
      ownerId: "u1",
      email: "dana@acme.com",
      reason: "stopped-by-you",
      nowIso: base.nowIso,
    });
    const agent = writes.find((w) => w.table === schema.replies);
    expect(agent?.set).toMatchObject({ agentStatus: "skipped", agentSummary: NOT_INTERESTED_AGENT_SUMMARY });
  });

  it("stopContacting is ignored for other tags", async () => {
    const { db } = fakeDb();
    const out = await applyReplyTagEffects(db, { ...base, tag: "lost", stopContacting: true });
    expect(out.stopped).toBe(false);
    expect(engine.addSuppression).not.toHaveBeenCalled();
  });
});

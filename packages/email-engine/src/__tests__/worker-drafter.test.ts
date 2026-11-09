/**
 * Writing never holds up sending: engineTick kicks the drafter and returns
 * while a slow model is still writing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { sqlDb, tableOf } from "./fixtures/sql-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), verifySmtp: vi.fn() }));
const fake = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  return {
    release: () => release(),
    // A model that takes as long as the test wants.
    generate: vi.fn(async (o: any) => {
      await gate;
      return { subject: "dallas depot", bodyText: `Hi Marco,\n\nA note.\n\n${o.senderName}`, bodyHtml: "", personalizationReason: "" };
    }),
    schedulerTick: vi.fn(async () => ({ started: 0, enqueued: 2, completed: 0, rescheduled: 0, skipped: [] })),
    processTick: vi.fn(async () => ({ sent: 2 })),
    replyAgentTick: vi.fn(async () => ({ processed: 1, replied: 1, escalated: 0, skipped: 0, failed: 0 })),
  };
});
vi.mock("../ai", async (orig) => ({ ...(await orig<typeof import("../ai")>()), generateEmailScriptOnTheFly: fake.generate }));
vi.mock("../scheduler", async (orig) => ({ ...(await orig<typeof import("../scheduler")>()), schedulerTick: fake.schedulerTick }));
vi.mock("../processor", async (orig) => ({ ...(await orig<typeof import("../processor")>()), processTick: fake.processTick }));
vi.mock("../reply-agent", async (orig) => ({ ...(await orig<typeof import("../reply-agent")>()), replyAgentTick: fake.replyAgentTick }));

import { engineTick } from "../worker";
import { drafterIdle, drafterRunning, kickDrafter, resetDrafterState, takeDrafterStats } from "../drafter";
import { heartbeatStats } from "../heartbeat";

const prevKey = process.env.GEMINI_API_KEY;
afterEach(() => {
  if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = prevKey;
});

function draftDb() {
  return sqlDb((c) => {
    const t = tableOf(c);
    if (c.op === "select") {
      if (t === "campaigns") return [{ id: "c1", userId: "u1", name: "AutoGTM", status: "running", templateId: null, dailyLimit: 60 }];
      if (t === "users") return [{ id: "u1", role: "admin", approvedAt: null }];
      if (t === "sequence_steps") return [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0 }];
      if (t === "sequence_step_variants")
        return [{ id: "v1", stepId: "st1", label: "A", subject: "s", bodyText: "b", bodyHtml: "", weight: 50, pausedAt: null, aiGenerateOnTheFly: true, aiPrompt: "write" }];
      if (t === "chad_gtm_runs") return [{ id: "run1" }];
      if (t === "leads") return [{ id: "l1", email: "marco@haulio.example", firstName: "Marco" }];
      if (t === "campaign_leads") {
        if (c.sql.includes("count(*) filter")) return [{ ready: 0, failed: 0 }];
        if (/"step_position" > \$/.test(c.sql)) return [];
        return [{ id: "cl1", leadId: "l1", stepPosition: 1 }];
      }
      return [];
    }
    if (c.op === "update" && c.set?.draftStatus === "drafting") return [{ id: "cl1" }];
    return [];
  });
}

describe("engineTick and the drafter", () => {
  it("sends and answers replies while a slow model is still writing", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    resetDrafterState();
    const { db, calls } = draftDb();
    const r = await engineTick(db);
    expect(r.sched.enqueued).toBe(2);
    await vi.waitFor(() => expect(fake.generate).toHaveBeenCalledTimes(1));
    expect(drafterRunning()).toBe(true);

    // While the model is still writing, a whole tick schedules, sends and answers replies.
    const r2 = await engineTick(db);
    expect(r2.proc).toEqual({ sent: 2 });
    expect(r2.agent?.replied).toBe(1);
    expect(fake.schedulerTick).toHaveBeenCalledTimes(2);
    expect(calls.some((c) => c.set?.draftStatus === "ready")).toBe(false);
    // Own running guard: no second pass while one runs.
    expect(kickDrafter(db)).toBe(false);
    expect(fake.generate).toHaveBeenCalledTimes(1);

    fake.release();
    await drafterIdle();
    expect(drafterRunning()).toBe(false);
    expect(calls.some((c) => c.set?.draftStatus === "ready")).toBe(true);
    const stats = heartbeatStats({ draft: takeDrafterStats() });
    expect(stats.drafted).toBe(1);
    // Counts are per heartbeat: taken once.
    expect(takeDrafterStats().drafted).toBe(0);
  });

  it("can be told not to draft", async () => {
    resetDrafterState();
    const { db, calls } = draftDb();
    await engineTick(db, { draft: false });
    expect(drafterRunning()).toBe(false);
    expect(calls.some((c) => tableOf(c) === "campaigns")).toBe(false);
  });
});

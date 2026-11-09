/**
 * Drafter: AI emails are written ahead of sending, in the scheduler's claim
 * order, with backoff and a give-up for Autopilot (never generic copy).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_FAIL_STREAK,
  campaignWritingStuck,
  DRAFT_MAX_ATTEMPTS,
  orderPassTasks,
  draftBackoffMs,
  draftConcurrency,
  drafterPass,
  isModelUnavailableError,
  pickStandInName,
  resetDrafterState,
  selectDraftTargets,
  SENDER_NAME_PLACEHOLDER,
  withSenderPlaceholder,
  type DraftGenerator,
} from "../drafter";
import { checkDraft, buildCriticPrompt, clearAnglePlans, clearRecentSent, rememberSent, writeEmail, type CopyRequest } from "../copywriter";
import { advanceSequenceAfterSend, COULD_NOT_WRITE_NOTE, renderWithVarsAndSpintax } from "../sequence";
import { heartbeatStats } from "../heartbeat";
import { sqlDb, tableOf, type SqlCall } from "./fixtures/sql-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), verifySmtp: vi.fn() }));

const NOW = new Date("2026-11-09T03:00:00.000Z"); // outside any 09-17 window: drafting still runs
const H = 3_600_000;

beforeEach(() => resetDrafterState());
afterEach(() => {
  clearRecentSent();
  clearAnglePlans();
});

describe("drafter settings", () => {
  it("backs off 15 min, 1 h, 4 h, 12 h", () => {
    expect([1, 2, 3, 4, 5].map((n) => draftBackoffMs(n) / 60_000)).toEqual([15, 60, 240, 720, 720]);
  });

  it("reads ENGINE_DRAFT_CONCURRENCY (default 6)", () => {
    expect(draftConcurrency({})).toBe(6);
    expect(draftConcurrency({ ENGINE_DRAFT_CONCURRENCY: "12" })).toBe(12);
    expect(draftConcurrency({ ENGINE_DRAFT_CONCURRENCY: "nope" })).toBe(6);
  });

  it("tells a model outage from a poor draft", () => {
    expect(isModelUnavailableError(new Error("No AI API key configured for on-the-fly generation"))).toBe(true);
    expect(isModelUnavailableError(new Error("Gemini API error (503): overloaded"))).toBe(true);
    expect(isModelUnavailableError(new Error("fetch failed"))).toBe(true);
    expect(isModelUnavailableError(new Error("This operation was aborted"))).toBe(true);
    expect(isModelUnavailableError(new Error("Draft failed quality checks: Remove these phrases"))).toBe(false);
    expect(isModelUnavailableError(new Error("The model returned no usable email"))).toBe(false);
    expect(isModelUnavailableError(new Error("Draft failed quality checks: their network timed out is invented"))).toBe(false);
  });

  it("treats a bad request or an empty answer as this lead's failure, not an outage", () => {
    expect(isModelUnavailableError(new Error("Gemini API error (400): invalid argument"))).toBe(false);
    expect(isModelUnavailableError(new Error("OpenAI API error (422): bad prompt"))).toBe(false);
    expect(isModelUnavailableError(new Error("Gemini returned empty candidate response"))).toBe(false);
    expect(isModelUnavailableError(new Error("Failed to parse AI JSON response"))).toBe(false);
    expect(isModelUnavailableError(new Error("OpenAI API error (429): rate limited"))).toBe(true);
    expect(isModelUnavailableError(new Error("OpenAI API error (401): bad key"))).toBe(true);
    expect(isModelUnavailableError(new Error("Gemini API error (500): internal"))).toBe(true);
  });
});

describe("sender name placeholder", () => {
  it("picks a stand-in that is not the lead's own name", () => {
    expect(pickStandInName(["Ellery", "Stone", "Acme"])).not.toBe("Ellery");
    expect(pickStandInName(["Marco", "Haulio"])).toBe("Ellery");
  });

  it("the copywriter gate and critic accept the stand-in; the real first name lands in the email", async () => {
    const standIn = pickStandInName(["Marco", "Haulio"]);
    const req: CopyRequest = {
      step: 1,
      sender: {
        companyName: "Northwind",
        valueProposition: "Dispatchers plan the day in one board instead of five spreadsheets.",
        proofPoints: ["Used by 40 regional carriers"],
        capabilities: ["One dispatch board for every depot", "Pushes route changes to drivers' phones"],
      },
      senderFirstName: standIn,
      recipient: { firstName: "Marco", jobTitle: "Head of Operations", company: "Haulio", industry: "Logistics" },
      research: {
        domain: "haulio.com",
        fetched: true,
        summary: "Haulio runs regional freight across Texas.",
        sellsTo: "retailers",
        sizeHint: "mid-market",
        systems: [],
        facts: [{ fact: "Haulio opened a second depot in Dallas.", quote: "our new Dallas depot is now open", date: "Oct 2026", relevance: 3 }],
        researchedAt: "2026-11-07T00:00:00Z",
      },
    };
    const body = `Hi Marco,\n\nSaw Haulio opened a second depot in Dallas. That's a second yard for you to dispatch from every morning.\n\nNorthwind puts every depot on one dispatch board and pushes route changes to drivers' phones, so Dallas runs from the same plan as home.\n\nOpen to seeing Dallas and your main yard on one board?\n\n${standIn}`;
    const draft = { subject: "dallas depot dispatch", hook: "fact" as const, factIndex: 1, body };
    expect(checkDraft(req, draft)).toEqual([]);
    expect(buildCriticPrompt(req, draft)).not.toContain("{{");
    // A raw placeholder would be rejected by the gate: that is why a stand-in is used.
    expect(checkDraft(req, { ...draft, body: body.replace(standIn, SENDER_NAME_PLACEHOLDER) }).join(" ")).toMatch(/placeholders/);

    const llm = vi.fn().mockResolvedValueOnce(draft).mockResolvedValueOnce({ logic: 5, claims: 5, fit: 5, specific: 5, reply: 4, notes: [] });
    const out = await writeEmail(req, llm);
    expect(out.problems).toEqual([]);
    const stored = withSenderPlaceholder(out.body, standIn);
    expect(stored.endsWith(SENDER_NAME_PLACEHOLDER)).toBe(true);
    expect(stored).not.toContain(standIn);
    const sent = renderWithVarsAndSpintax(stored, { sender_name: "Dana" });
    expect(sent.endsWith("\n\nDana")).toBe(true);
  });
});

/* ─── Selection ──────────────────────────────────────────────────────── */

const plan = { positions: [1, 2, 3], variantIds: ["v1", "v2", "v3"] };

function selectionDb(opts: {
  ready: number;
  failed?: number;
  followUps: number;
  fresh?: number;
  counts?: Array<{ followUp: boolean; priority: number | null; ready: number; pending: number; failed: number }>;
  freshPriority?: number | null;
}) {
  return sqlDb((c) => {
    if (tableOf(c) !== "campaign_leads") return [];
    if (c.sql.includes("count(*) filter"))
      return opts.counts ?? [{ followUp: false, priority: null, ready: opts.ready, pending: opts.failed ?? 0, failed: opts.failed ?? 0 }];
    if (/"step_position" > \$/.test(c.sql))
      return Array.from({ length: opts.followUps }, (_, i) => ({ id: `f${i}`, leadId: `lf${i}`, stepPosition: 2 }));
    return Array.from({ length: opts.fresh ?? 0 }, (_, i) => ({
      id: `n${i}`,
      leadId: `ln${i}`,
      stepPosition: 1,
      priority: opts.freshPriority ?? null,
    }));
  });
}

describe("selectDraftTargets", () => {
  it("drafts due follow-ups first, then new leads in priority order up to 1.5 days ahead", async () => {
    const { db, calls } = selectionDb({ ready: 80, followUps: 3, fresh: 7 });
    const r = await selectDraftTargets(db, { id: "c1", dailyLimit: 60 }, plan, NOW);
    expect(r.targets.map((t) => t.id)).toEqual(["f0", "f1", "f2", "n0", "n1", "n2", "n3", "n4", "n5", "n6"]);
    const [, follow, fresh] = calls;
    const order = `order by "campaign_leads"."step_position" desc, "campaign_leads"."priority" asc nulls last, "campaign_leads"."created_at" asc`;
    for (const q of [follow!, fresh!]) {
      expect(q.sql).toContain(order);
      expect(q.sql).toContain(`"campaign_leads"."status" = $`);
      // Never people who replied; never rows waiting for a retry.
      expect(q.sql).toContain("NOT EXISTS (SELECT 1 FROM leads l");
      expect(q.sql).toMatch(/"draft_retry_at" is null/);
    }
    // Follow-ups: due within a day.
    expect(follow!.params).toContain(new Date(NOW.getTime() + 24 * H).toISOString());
    // 60/day * 1.5 = 90 ahead; 80 ready + 3 follow-ups leaves room for 7.
    expect(r.targets.filter((t) => t.stepPosition === 1)).toHaveLength(7);
    // Counts read only rows that hold a draft (the partial draft index), never the whole audience.
    expect(calls[0]!.sql).toMatch(/"draft_status" in \(\$\d+, \$\d+, \$\d+\)/);
    expect(calls[0]!.sql).toContain("group by");
  });

  it("drafts follow-ups even when the look-ahead is full, but no new leads", async () => {
    const { db } = selectionDb({ ready: 95, followUps: 2, fresh: 5 });
    const r = await selectDraftTargets(db, { id: "c1", dailyLimit: 60 }, plan, NOW);
    expect(r.targets.map((t) => t.id)).toEqual(["f0", "f1"]);
  });

  it("counts failed and in-progress drafts against the look-ahead (no runaway when drafts keep failing)", async () => {
    const counts = [{ followUp: false, priority: 1, ready: 0, pending: 90, failed: 90 }];
    const { db } = selectionDb({ ready: 0, followUps: 0, fresh: 30, counts, freshPriority: 1 });
    const r = await selectDraftTargets(db, { id: "c1", dailyLimit: 60 }, plan, NOW);
    expect(r.targets).toEqual([]);
    expect(r.failed).toBe(90);
  });

  it("drafts a higher tier added later at once, ahead of ready lower-tier drafts", async () => {
    const counts = [{ followUp: false, priority: 3, ready: 90, pending: 0, failed: 0 }];
    // Tier 1 just arrived: only drafts sent before it count, and none are.
    const tier1 = selectionDb({ ready: 0, followUps: 0, fresh: 20, counts, freshPriority: 1 });
    const r1 = await selectDraftTargets(tier1.db, { id: "c1", dailyLimit: 60 }, plan, NOW);
    expect(r1.targets).toHaveLength(20);
    expect(r1.ready).toBe(90);
    // More tier 3: the 90 ready tier-3 drafts fill the look-ahead.
    const tier3 = selectionDb({ ready: 0, followUps: 0, fresh: 20, counts, freshPriority: 3 });
    const r3 = await selectDraftTargets(tier3.db, { id: "c1", dailyLimit: 60 }, plan, NOW);
    expect(r3.targets).toEqual([]);
  });

  it("caps one pass at 60 leads per campaign", async () => {
    const { db, calls } = selectionDb({ ready: 0, followUps: 0, fresh: 60 });
    await selectDraftTargets(db, { id: "c1", dailyLimit: 500 }, plan, NOW);
    expect(calls[2]!.params.at(-1)).toBe(60);
  });

  it("drafts for people who replied only when the campaign keeps sending after a reply", async () => {
    const { db, calls } = selectionDb({ ready: 0, followUps: 0, fresh: 1 });
    await selectDraftTargets(db, { id: "c1", dailyLimit: 60, stopOnReply: false }, plan, NOW);
    expect(calls[2]!.sql).not.toContain("NOT EXISTS (SELECT 1 FROM leads l");
  });

  it("drafts no new leads when only follow-ups are AI-written", async () => {
    const { db, calls } = selectionDb({ ready: 0, followUps: 0, fresh: 5 });
    const r = await selectDraftTargets(db, { id: "c1", dailyLimit: 60 }, { positions: [2, 3], variantIds: ["v2"] }, NOW);
    expect(r.targets).toEqual([]);
    expect(calls).toHaveLength(2);
  });
});

/* ─── Passes ─────────────────────────────────────────────────────────── */

const CAMPAIGN = {
  id: "c1",
  userId: "u1",
  name: "AutoGTM: Northwind",
  status: "running",
  templateId: "t1",
  dailyLimit: 60,
};
const AI_VARIANT = {
  id: "v1",
  stepId: "st1",
  label: "A",
  subject: "baseline subject",
  bodyText: "Hi {{first_name}},\n\nShould I close the loop for now, or check back next quarter?\n\n{{sender_name}}",
  bodyHtml: "",
  weight: 50,
  pausedAt: null,
  aiGenerateOnTheFly: true,
  aiPrompt: JSON.stringify({ instruction: "Write email 1", context: { companyName: "Northwind" } }),
};

function passDb(opts: { autopilot: boolean; leads: number; attempts?: number }) {
  return sqlDb((c: SqlCall) => {
    const t = tableOf(c);
    if (c.op === "select") {
      if (t === "campaigns") return [CAMPAIGN];
      if (t === "users") return [{ id: "u1", role: "admin", approvedAt: null }];
      if (t === "sequence_steps") return [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0 }];
      if (t === "sequence_step_variants") return [AI_VARIANT];
      if (t === "chad_gtm_runs") return opts.autopilot ? [{ id: "run1" }] : [];
      if (t === "email_templates") return [{ source: "user" }];
      if (t === "leads")
        return Array.from({ length: opts.leads }, (_, i) => ({
          id: `l${i}`,
          email: `p${i}@haulio.example`,
          firstName: "Marco",
          company: "Haulio",
        }));
      if (t === "campaign_leads") {
        if (c.sql.includes("count(*) filter")) return [{ ready: 0, failed: 0 }];
        if (c.sql.includes(`"draft_attempts" from`)) return [{ attempts: opts.attempts ?? 0 }];
        if (/"step_position" > \$/.test(c.sql)) return [];
        return Array.from({ length: opts.leads }, (_, i) => ({ id: `cl${i}`, leadId: `l${i}`, stepPosition: 1 }));
      }
      return [];
    }
    // The lease claim succeeds; other writes return nothing.
    if (c.op === "update" && c.set?.draftStatus === "drafting") return [{ id: "x" }];
    return [];
  });
}

const writes = (calls: SqlCall[]) => calls.filter((c) => c.op === "update" && tableOf(c) === "campaign_leads" && c.set);

describe("drafterPass", () => {
  it("stores a ready draft with {{sender_name}} and writes in parallel", async () => {
    const { db, calls } = passDb({ autopilot: true, leads: 4 });
    let inFlight = 0;
    let maxInFlight = 0;
    const generate: DraftGenerator = async (o) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { subject: "dallas depot", bodyText: `Hi Marco,\n\nA specific note.\n\n${o.senderName}`, bodyHtml: "", personalizationReason: "" };
    };
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 2 });
    expect(r).toMatchObject({ drafted: 4, failed: 0, gaveUp: 0, campaigns: 1 });
    expect(maxInFlight).toBe(2);
    const ready = writes(calls).filter((w) => w.set!.draftStatus === "ready");
    expect(ready).toHaveLength(4);
    expect(ready[0]!.set).toMatchObject({ draftStep: 1, draftVariantId: "v1", draftSubject: "dallas depot", draftError: null });
    expect(String(ready[0]!.set!.draftBodyText).endsWith(SENDER_NAME_PLACEHOLDER)).toBe(true);
    expect(String(ready[0]!.set!.draftBodyHtml)).toContain(SENDER_NAME_PLACEHOLDER);
    // Lease: claimed for this step first, so two drafters never write one lead twice.
    expect(writes(calls)[0]!.set).toMatchObject({ draftStatus: "drafting", draftStep: 1 });
  });

  it("Autopilot: a poor draft is retried later, never replaced by the baseline copy", async () => {
    const { db, calls } = passDb({ autopilot: true, leads: 1, attempts: 1 });
    const generate = vi.fn(async () => {
      throw new Error("Draft failed quality checks: Remove these phrases: close the loop.");
    });
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(r).toMatchObject({ drafted: 0, failed: 1, fellBack: 0 });
    const w = writes(calls);
    expect(w.some((x) => x.set!.draftStatus === "ready")).toBe(false);
    const failed = w.find((x) => x.set!.draftStatus === "failed")!;
    expect(failed.set).toMatchObject({ draftAttempts: 2 });
    expect(new Date(String(failed.set!.draftRetryAt)).getTime() - NOW.getTime()).toBe(H); // 2nd failure: 1 h
  });

  it(`Autopilot: after ${DRAFT_MAX_ATTEMPTS} failures the lead's sequence is cancelled ('could-not-write')`, async () => {
    const { db, calls } = passDb({ autopilot: true, leads: 1, attempts: DRAFT_MAX_ATTEMPTS - 1 });
    const generate = vi.fn(async () => {
      throw new Error("The model returned no usable email");
    });
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(r.gaveUp).toBe(1);
    const cancel = writes(calls).find((x) => x.set!.status === "cancelled")!;
    expect(cancel.set).toMatchObject({ lastError: COULD_NOT_WRITE_NOTE, draftStatus: "failed", draftAttempts: DRAFT_MAX_ATTEMPTS });
    expect(writes(calls).some((x) => x.set!.draftStatus === "ready")).toBe(false);
  });

  it("Autopilot: a model outage spends no attempt, marks writing-unavailable and stops the pass", async () => {
    const { db, calls } = passDb({ autopilot: true, leads: 5 });
    const generate = vi.fn(async () => {
      throw new Error("Gemini API error (503): overloaded");
    });
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(r.modelUnavailable).toBe(true);
    const failed = writes(calls).filter((x) => x.set!.draftStatus === "failed");
    expect(failed).toHaveLength(3);
    expect(String(failed[0]!.set!.draftError)).toMatch(/^writing-unavailable: /);
    expect(failed[0]!.set).not.toHaveProperty("draftAttempts");
    expect(new Date(String(failed[0]!.set!.draftRetryAt)).getTime() - NOW.getTime()).toBe(15 * 60_000);
    // Cooling down: the next pass writes nothing.
    const again = await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(again.coolingDown).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("Autopilot without an API key never calls the model and never sends generic copy", async () => {
    const prev = { g: process.env.GEMINI_API_KEY, o: process.env.OPENAI_API_KEY, gg: process.env.GOOGLE_API_KEY };
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    try {
      const { db, calls } = passDb({ autopilot: true, leads: 1 });
      const r = await drafterPass(db, { now: NOW, concurrency: 1 });
      expect(r.drafted).toBe(0);
      const failed = writes(calls).find((x) => x.set!.draftStatus === "failed")!;
      expect(String(failed.set!.draftError)).toMatch(/^writing-unavailable: No AI API key/);
    } finally {
      if (prev.g !== undefined) process.env.GEMINI_API_KEY = prev.g;
      if (prev.o !== undefined) process.env.OPENAI_API_KEY = prev.o;
      if (prev.gg !== undefined) process.env.GOOGLE_API_KEY = prev.gg;
    }
  });

  it("manual campaign: a failed AI draft falls back to the user's own variant text", async () => {
    const { db, calls } = passDb({ autopilot: false, leads: 1 });
    const generate = vi.fn(async () => {
      throw new Error("Draft failed quality checks: too long");
    });
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(r.fellBack).toBe(1);
    const ready = writes(calls).find((x) => x.set!.draftStatus === "ready")!;
    expect(ready.set).toMatchObject({ draftSubject: AI_VARIANT.subject, draftBodyText: AI_VARIANT.bodyText });
  });

  it("skips owners who are not approved", async () => {
    const { db } = sqlDb((c) => {
      const t = tableOf(c);
      if (t === "campaigns") return [CAMPAIGN];
      if (t === "users") return [{ id: "u1", role: "user", approvedAt: null }];
      return [];
    });
    const generate = vi.fn();
    const r = await drafterPass(db, { now: NOW, generate: generate as any });
    expect(r.campaigns).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("drafterPass safety", () => {
  it("never re-leases a draft another drafter just stored as ready", async () => {
    const { db, calls } = passDb({ autopilot: true, leads: 1 });
    await drafterPass(db, { now: NOW, generate: async (o) => ({ subject: "s", bodyText: `Hi,\n\nNote.\n\n${o.senderName}`, bodyHtml: "", personalizationReason: "" }), concurrency: 1 });
    const lease = calls.find((c) => c.op === "update" && c.set?.draftStatus === "drafting")!;
    expect(lease.sql).toMatch(/"draft_status" <> \$/);
    expect(lease.sql).toMatch(/"draft_variant_id" not in/);
  });

  it("keeps a pass short: a few drafts per worker, then plans again", async () => {
    const { db } = passDb({ autopilot: true, leads: 30 });
    const generate = vi.fn(async (o: any) => ({ subject: "s", bodyText: `Hi,\n\nNote.\n\n${o.senderName}`, bodyHtml: "", personalizationReason: "" }));
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 2 });
    expect(r.drafted).toBe(8);
    expect(generate).toHaveBeenCalledTimes(8);
  });

  it(`a campaign whose last ${CAMPAIGN_FAIL_STREAK} drafts all failed cancels nobody and shows writing-unavailable`, async () => {
    const { db, calls } = passDb({ autopilot: true, leads: 12, attempts: DRAFT_MAX_ATTEMPTS - 1 });
    const generate = vi.fn(async () => {
      throw new Error("Draft failed quality checks: Remove these phrases: close the loop.");
    });
    await drafterPass(db, { now: NOW, generate, concurrency: 3 });
    expect(generate).toHaveBeenCalledTimes(12);
    // The first failures are the leads' own (last attempt: cancelled); then the campaign is held.
    const cancels = writes(calls).filter((x) => x.set!.status === "cancelled");
    expect(cancels.length).toBe(CAMPAIGN_FAIL_STREAK - 1);
    const held = writes(calls).filter((x) => String(x.set!.draftError ?? "").startsWith("writing-unavailable: every recent draft failed"));
    expect(held).toHaveLength(12 - (CAMPAIGN_FAIL_STREAK - 1));
    expect(held[0]!.set).not.toHaveProperty("draftAttempts");
    expect(campaignWritingStuck("c1")).toBe(true);
    // Next pass: only a couple of probe drafts.
    generate.mockClear();
    await drafterPass(db, { now: NOW, generate, concurrency: 3 });
    expect(generate).toHaveBeenCalledTimes(2);
    // One success clears it.
    generate.mockImplementationOnce((async (o: any) => ({ subject: "s", bodyText: `Hi,\n\nNote.\n\n${o.senderName}`, bodyHtml: "", personalizationReason: "" })) as any);
    await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(campaignWritingStuck("c1")).toBe(false);
  });

  it("follow-ups sign with the step-1 mailbox's real name, not a stand-in", async () => {
    const step2Variant = { ...AI_VARIANT, id: "v2", stepId: "st2" };
    const { db, calls } = sqlDb((c: SqlCall) => {
      const t = tableOf(c);
      if (c.op === "select") {
        if (t === "campaigns") return [CAMPAIGN];
        if (t === "users") return [{ id: "u1", role: "admin", approvedAt: null }];
        if (t === "sequence_steps")
          return [
            { id: "st1", campaignId: "c1", position: 1, delayDays: 0 },
            { id: "st2", campaignId: "c1", position: 2, delayDays: 2 },
          ];
        if (t === "sequence_step_variants") return c.params.includes("st2") ? [step2Variant] : [];
        if (t === "chad_gtm_runs") return [{ id: "run1" }];
        if (t === "leads") return [{ id: "l1", email: "marco@haulio.example", firstName: "Marco", company: "Haulio" }];
        if (t === "email_jobs") {
          if (c.sql.includes('"sender_id"') && !c.sql.includes('"body_text"')) return [{ senderId: "s1" }];
          return [{ step: 1, subject: "dallas depot", bodyText: "Hi Marco,\n\nFirst note.\n\nDana" }];
        }
        if (t === "sender_accounts") return [{ senderName: "Dana Lee", fromName: "Dana Lee", email: "dana@northwind.example" }];
        if (t === "campaign_leads") {
          if (c.sql.includes("count(*) filter")) return [];
          if (/"step_position" > \$/.test(c.sql)) return [{ id: "cl1", leadId: "l1", stepPosition: 2 }];
          return [];
        }
        return [];
      }
      if (c.op === "update" && c.set?.draftStatus === "drafting") return [{ id: "x" }];
      return [];
    });
    const generate = vi.fn(async (o: any) => ({ subject: "Re: dallas depot", bodyText: `Hi Marco,\n\nOne more thought.\n\n${o.senderName}`, bodyHtml: "", personalizationReason: "" }));
    const r = await drafterPass(db, { now: NOW, generate, concurrency: 1 });
    expect(r.drafted).toBe(1);
    expect(generate.mock.calls[0]![0].senderName).toBe("Dana");
    const ready = writes(calls).find((w) => w.set!.draftStatus === "ready")!;
    expect(String(ready.set!.draftBodyText).endsWith("\n\nDana")).toBe(true);
  });

  it("orders a pass: every campaign's follow-ups first, round-robin, rotating the first campaign", () => {
    const a = [{ id: "a1", stepPosition: 1 }, { id: "a2", stepPosition: 2 }, { id: "a3", stepPosition: 1 }];
    const b = [{ id: "b1", stepPosition: 1 }, { id: "b2", stepPosition: 1 }];
    expect(orderPassTasks([a, b], 10).map((t) => t.id)).toEqual(["a2", "a1", "b1", "a3", "b2"]);
    expect(orderPassTasks([a, b], 3, 1).map((t) => t.id)).toEqual(["a2", "b1", "a1"]);
  });
});

describe("repetition across parallel drafts", () => {
  it("re-checks repetition after the review, so two drafts written at once never share an opener", async () => {
    const req: CopyRequest = {
      step: 1,
      campaignKey: "c-par",
      sender: {
        companyName: "Northwind",
        valueProposition: "Dispatchers plan the day in one board instead of five spreadsheets.",
        proofPoints: ["Used by 40 regional carriers"],
        capabilities: ["One dispatch board for every depot", "Pushes route changes to drivers' phones"],
      },
      senderFirstName: "Ellery",
      recipient: { firstName: "Marco", jobTitle: "Head of Operations", company: "Haulio", industry: "Logistics" },
      research: {
        domain: "haulio.com",
        fetched: true,
        summary: "Haulio runs regional freight across Texas.",
        sellsTo: "retailers",
        sizeHint: "mid-market",
        systems: [],
        facts: [{ fact: "Haulio opened a second depot in Dallas.", quote: "our new Dallas depot is now open", date: "Oct 2026", relevance: 3 }],
        researchedAt: "2026-11-07T00:00:00Z",
      },
    };
    const body = `Hi Marco,\n\nSaw Haulio opened a second depot in Dallas. That's a second yard for you to dispatch from every morning.\n\nNorthwind puts every depot on one dispatch board and pushes route changes to drivers' phones, so Dallas runs from the same plan as home.\n\nOpen to seeing Dallas and your main yard on one board?\n\nEllery`;
    const draft = { subject: "dallas depot dispatch", hook: "fact" as const, factIndex: 1, body };
    let reviews = 0;
    const llm = vi.fn(async (_prompt: string, system?: string) => {
      if (/recipient of a cold email/.test(String(system))) {
        // Another draft for this campaign finishes with the same opener while this one is reviewed.
        if (reviews++ === 0) rememberSent(req, body);
        return { logic: 5, claims: 5, fit: 5, specific: 5, reply: 4, notes: [] };
      }
      return draft;
    });
    await expect(writeEmail(req, llm as any)).rejects.toThrow(/already going to other leads/);
  });
});

describe("draft lifecycle", () => {
  it("clears the draft when the lead moves to the next step", async () => {
    const { db, calls } = sqlDb((c) => (c.op === "update" ? [{ id: "cl1" }] : []));
    const r = await advanceSequenceAfterSend(db, {
      campaignId: "c1",
      campaignLeadId: "cl1",
      stepPosition: 1,
      sentAt: NOW.toISOString(),
      steps: [
        { id: "st1", campaignId: "c1", position: 1, delayDays: 0, type: "initial" },
        { id: "st2", campaignId: "c1", position: 2, delayDays: 2, type: "follow_up" },
      ],
    });
    expect(r).toBe("requeued");
    expect(calls[0]!.set).toMatchObject({ stepPosition: 2, draftStatus: null, draftStep: null, draftBodyText: null, draftAttempts: 0 });
  });
});

describe("heartbeat", () => {
  it("includes drafter numbers", () => {
    const s = heartbeatStats({ draft: { drafted: 7, failed: 2, gaveUp: 1, fellBack: 0, ready: 40, waiting: 3, running: 1 } });
    expect(s).toMatchObject({ drafted: 7, draftFailed: 2, draftGaveUp: 1, draftsReady: 40, draftsWaiting: 3, drafterRunning: 1 });
  });
});

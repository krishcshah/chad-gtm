/**
 * The scheduler never writes emails: AI-written steps are claimed only with a
 * ready draft, which it renders with the chosen mailbox's first name.
 */
import { describe, expect, it, vi } from "vitest";
import type { SenderRow } from "../db-port";
import { scheduleCampaign, sendBlockFor, SEND_BLOCK_REASONS } from "../scheduler";
import { resolveStepContent, type SequenceVariantRow } from "../sequence";
import { sqlDb, tableOf, type SqlCall } from "./fixtures/sql-db";

vi.mock("../mailer", () => ({ sendMail: vi.fn(), verifySmtp: vi.fn() }));
// Any AI call from the scheduler would hit these spies.
const ai = vi.hoisted(() => ({ generate: vi.fn(), llm: vi.fn() }));
vi.mock("../ai", async (orig) => ({
  ...(await orig<typeof import("../ai")>()),
  generateEmailScriptOnTheFly: ai.generate,
  callLlmJson: ai.llm,
}));

const NOW = new Date("2026-11-09T12:00:00.000Z");

function sender(id: string, fromName: string, signature = ""): SenderRow {
  return {
    id,
    userId: "admin",
    senderName: fromName,
    fromName,
    email: `${fromName.split(" ")[0]!.toLowerCase()}@pool.example`,
    dailyLimit: 30,
    hourlyLimit: 30,
    signature,
    status: "active",
    imapHost: "",
    imapStatus: "ok",
    isSystemPool: false,
    createdAt: "2025-01-01T00:00:00.000Z",
  } as unknown as SenderRow;
}

function campaign(over: Record<string, unknown> = {}): any {
  return {
    id: "c1",
    userId: "u1",
    name: "AutoGTM: Northwind",
    status: "running",
    leadListId: "list1",
    templateId: "t1",
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "00:00",
    sendingWindowEnd: "23:59",
    dailyLimit: 60,
    minDelaySec: 45,
    maxDelaySec: 120,
    maxEmailsPerSenderPerDay: 30,
    stopOnReply: true,
    retryFailed: true,
    retryCount: 2,
    lastSenderIdx: 0,
    ...over,
  };
}

const BASELINE = "Hi {{first_name}},\n\nShould I close the loop for now, or check back next quarter?\n\n{{sender_name}}";
const variant = (id: string, stepId: string, ai: boolean): SequenceVariantRow => ({
  id,
  stepId,
  label: "A",
  subject: "baseline subject",
  bodyText: BASELINE,
  bodyHtml: "",
  weight: 50,
  pausedAt: null,
  aiGenerateOnTheFly: ai,
  aiPrompt: ai ? '{"instruction":"write"}' : null,
});

const DRAFT = {
  draftStep: 1,
  draftVariantId: "v1",
  draftSubject: "dallas depot",
  draftBodyText: "Hi Marco,\n\nA note written for Haulio.\n\n{{sender_name}}",
  draftBodyHtml: "<p>Hi Marco,</p><p>A note written for Haulio.</p><p>{{sender_name}}</p>",
  draftStatus: "ready",
};

interface World {
  ai: boolean;
  step: number;
  rows: Array<Record<string, unknown>>;
  sticky?: Array<{ campaignLeadId: string; senderId: string; stepPosition: number }>;
  thread?: Array<{ step: number; subject: string; bodyText: string }>;
  claimable?: number;
  writingDown?: boolean;
  pending?: number;
}

function world(w: World) {
  return sqlDb((c: SqlCall) => {
    const t = tableOf(c);
    if (c.op === "select") {
      if (t === "sequence_steps")
        return [
          { id: "st1", campaignId: "c1", position: 1, delayDays: 0 },
          { id: "st2", campaignId: "c1", position: 2, delayDays: 2 },
        ];
      if (t === "sequence_step_variants")
        return c.params.includes("st2") ? [variant("v2", "st2", w.ai)] : [variant("v1", "st1", w.ai)];
      if (t === "workspaces") return [];
      if (t === "workspace_settings") return [{ companyName: "Northwind", postalAddress: "1 Main St, Springfield" }];
      if (t === "leads") return [{ id: "l1", email: "marco@haulio.example", firstName: "Marco", company: "Haulio" }];
      if (t === "email_jobs") {
        if (c.sql.includes("max(case")) return [];
        if (c.sql.includes(`"body_text"`)) return w.thread ?? [];
        return w.sticky ?? [];
      }
      if (t === "campaign_leads") {
        if (c.sql.includes("count(*)")) return [{ n: w.pending ?? 0 }];
        if (c.sql.includes(`"draft_body_text"`)) return w.rows.map((r) => ({ id: "cl1", leadId: "l1", stepPosition: w.step, ...r }));
        if (c.sql.includes(`"draft_error" like`)) return w.writingDown ? [{ id: "cl1" }] : [];
        return (w.claimable ?? 1) > 0 ? [{ id: "cl1", leadId: "l1", stepPosition: w.step }] : [];
      }
      return [];
    }
    if (c.op === "update" && t === "campaign_leads" && c.set?.status === "scheduled") return [{ id: "cl1" }];
    return [];
  });
}

const claimQuery = (calls: SqlCall[]) => calls.find((c) => tableOf(c) === "campaign_leads" && c.sql.includes("order by"))!;
const jobs = (calls: SqlCall[]) => calls.filter((c) => c.op === "insert" && tableOf(c) === "email_jobs").map((c) => c.values);

describe("scheduler with drafts", () => {
  it("claims only leads whose AI step has a ready draft, and never calls the AI", async () => {
    const { db, calls } = world({ ai: true, step: 1, rows: [DRAFT] });
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender("s1", "Dana Lee", "Dana Lee\nHead of Growth")] });
    expect(r.enqueued).toBe(1);
    const claim = claimQuery(calls);
    expect(claim.sql).toContain(`"campaign_leads"."step_position" not in`);
    expect(claim.sql).toContain(`"campaign_leads"."draft_status" = $`);
    expect(claim.sql).toContain(`"campaign_leads"."draft_step" = "campaign_leads"."step_position"`);
    expect(claim.sql).toContain(`"campaign_leads"."draft_variant_id" in`);
    // Claim order unchanged: follow-ups, then priority tiers, then age.
    expect(claim.sql).toContain(
      `order by "campaign_leads"."step_position" desc, "campaign_leads"."priority" asc nulls last, "campaign_leads"."created_at" asc`,
    );
    expect(ai.generate).not.toHaveBeenCalled();
    expect(ai.llm).not.toHaveBeenCalled();

    const [job] = jobs(calls);
    expect(job.subject).toBe("dallas depot");
    expect(job.variantId).toBe("v1");
    // {{sender_name}} became the chosen mailbox's first name, signed once.
    expect(job.bodyText).toBe("Hi Marco,\n\nA note written for Haulio.\n\nDana Lee\nHead of Growth");
    expect(job.bodyText).not.toContain("{{");
    expect(job.bodyHtml).not.toContain("{{");
    expect(job.bodyText).not.toContain("close the loop");
  });

  it("a follow-up fills in its step-1 mailbox's name and keeps the thread subject", async () => {
    const draft2 = { ...DRAFT, draftStep: 2, draftVariantId: "v2", draftSubject: "Re: dallas depot", draftBodyText: "Hi Marco,\n\nOne more thought.\n\n{{sender_name}}" };
    const { db, calls } = world({
      ai: true,
      step: 2,
      rows: [draft2],
      sticky: [{ campaignLeadId: "cl1", senderId: "s2", stepPosition: 1 }],
      thread: [{ step: 1, subject: "dallas depot ops", bodyText: "Hi Marco, ..." }],
    });
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender("s1", "Dana Lee"), sender("s2", "Morgan Diaz")] });
    expect(r.enqueued).toBe(1);
    const [job] = jobs(calls);
    expect(job.senderId).toBe("s2");
    expect(job.subject).toBe("Re: dallas depot ops");
    expect(job.bodyText.endsWith("\n\nMorgan")).toBe(true);
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it("manual steps need no draft and keep working as before", async () => {
    const { db, calls } = world({ ai: false, step: 1, rows: [{}] });
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender("s1", "Dana Lee")] });
    expect(r.enqueued).toBe(1);
    expect(claimQuery(calls).sql).not.toContain("draft_status");
    const [job] = jobs(calls);
    expect(job.subject).toBe("baseline subject");
    expect(job.bodyText).toBe("Hi Marco,\n\nShould I close the loop for now, or check back next quarter?\n\nDana");
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it("says 'writing-unavailable' when emails wait because the model is down", async () => {
    const { db } = world({ ai: true, step: 1, rows: [], claimable: 0, pending: 3, writingDown: true });
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender("s1", "Dana Lee")] });
    expect(r).toEqual({ enqueued: 0, note: "writing-unavailable" });
    expect(sendBlockFor(r)).toBe("writing-unavailable");
    expect(SEND_BLOCK_REASONS).toContain("writing-unavailable");
  });

  it("waiting for drafts is not a block reason", async () => {
    const { db } = world({ ai: true, step: 1, rows: [], claimable: 0, pending: 3 });
    const r = await scheduleCampaign(db, campaign(), NOW, { senders: [sender("s1", "Dana Lee")] });
    expect(r).toEqual({ enqueued: 0, note: "waiting-retry" });
    expect(sendBlockFor(r)).toBeNull();
  });
});

describe("resolveStepContent", () => {
  const steps = [{ id: "st1", campaignId: "c1", position: 1, delayDays: 0, type: "initial" as const }];
  const vars = { first_name: "Marco", sender_name: "Dana" };

  it("an AI step without a ready draft for this step is never sent (no baseline)", async () => {
    const { db } = sqlDb(() => []);
    const base = { campaignId: "c1", stepPosition: 1, templateId: null, vars, steps, variants: [variant("v1", "st1", true)] };
    expect(await resolveStepContent(db, { ...base, draft: null })).toEqual({ error: "draft-missing" });
    expect(await resolveStepContent(db, { ...base, draft: { ...DRAFT, draftStep: 2 } })).toEqual({ error: "draft-missing" });
    expect(await resolveStepContent(db, { ...base, draft: { ...DRAFT, draftStatus: "failed" } })).toEqual({ error: "draft-missing" });
    // A draft for a variant that was paused or removed is stale.
    expect(await resolveStepContent(db, { ...base, draft: { ...DRAFT, draftVariantId: "gone" } })).toEqual({ error: "draft-missing" });
    const ok = await resolveStepContent(db, { ...base, draft: DRAFT });
    expect(ok).toMatchObject({ subject: "dallas depot", format: "html", variantId: "v1" });
    expect((ok as any).bodyText.endsWith("Dana")).toBe(true);
  });
});

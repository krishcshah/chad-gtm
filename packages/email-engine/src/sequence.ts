/**
 * F19 sequence helpers for the scheduler/processor.
 * Calendar-day waits, equal-weight A/B, {{vars}} + spintax at enqueue.
 */
import {
  expandSpintax,
  pickVariantEqualWeight,
  renderTemplate,
  schema,
} from "@smartreach/database";
import { addCalendarDays } from "@smartreach/shared";
import { and, asc, eq, inArray, isNull, like, lte, notInArray, or, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";
import type { CampaignResearchContext } from "./ai";

export type SequenceStepRow = {
  id: string;
  campaignId: string;
  position: number;
  delayDays: number;
  type: "initial" | "follow_up";
};

export type SequenceVariantRow = {
  id: string;
  stepId: string;
  label: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  weight: number;
  pausedAt: string | null;
  aiGenerateOnTheFly?: boolean | null;
  aiPrompt?: string | null;
};

export type StepContent = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
  stepPosition: number;
  sequenceStepId: string | null;
  variantId: string | null;
  format: "text" | "html";
};

/**
 * Cleanly extract the first name of a sender account to use in email signatures and greetings.
 * Examples:
 * - { fromName: "Alex Vance", email: "alex@company.com" } -> "Alex"
 * - { fromName: null, email: "arthur.dent@company.com" } -> "Arthur"
 * - { senderName: "Sarah Connor" } -> "Sarah"
 * Never returns an email address or the account owner's full name.
 */
export function extractSenderFirstName(sender?: { senderName?: string | null; fromName?: string | null; email?: string | null } | null): string {
  if (!sender) return "Alex";
  const raw = (sender.fromName || sender.senderName || "").trim();
  if (raw) {
    const first = raw.split(" ")[0].trim();
    if (first && !first.includes("@") && first.length > 1) {
      return first.charAt(0).toUpperCase() + first.slice(1);
    }
  }
  if (sender.email) {
    const local = sender.email.split("@")[0].split(".")[0].split("_")[0].trim();
    if (local && local.length > 1) {
      return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
    }
  }
  return "Alex";
}

/** Load ordered steps for a campaign (empty ⇒ single-template mode). */
export async function loadCampaignSequenceSteps(
  db: EngineDb,
  campaignId: string,
): Promise<SequenceStepRow[]> {
  return db
    .select()
    .from(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.campaignId, campaignId))
    .orderBy(asc(schema.sequenceSteps.position));
}

export async function loadStepVariants(
  db: EngineDb,
  stepId: string,
): Promise<SequenceVariantRow[]> {
  return db
    .select()
    .from(schema.sequenceStepVariants)
    .where(eq(schema.sequenceStepVariants.stepId, stepId))
    .orderBy(asc(schema.sequenceStepVariants.label));
}

/** Render subject/bodies: spintax then {{vars}} (vars inside a spin still resolve). */
export function renderWithVarsAndSpintax(
  text: string,
  vars: Record<string, string | null | undefined>,
): string {
  return expandSpintax(renderTemplate(text, vars));
}

/**
 * `aiPrompt` is either a structured JSON envelope (new campaigns) or a legacy
 * plain-text instruction. Parsing it here keeps context and approved voice
 * exemplars intact all the way to the send-time generator.
 */
export interface ParsedAiPromptPayload {
  instruction: string;
  campaignContext?: CampaignResearchContext;
  styleExamples?: Array<{ subject: string; bodyText: string; recipientTitle?: string }>;
  negativeConstraints?: string[];
  requireSpintax?: boolean;
}

export function parseAiPromptPayload(raw: string): ParsedAiPromptPayload {
  const text = (raw || "").trim();
  if (!text) return { instruction: "" };

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && typeof parsed.instruction === "string") {
      return {
        instruction: parsed.instruction,
        campaignContext: parsed.context,
        styleExamples: Array.isArray(parsed.styleExamples) ? parsed.styleExamples : undefined,
        negativeConstraints: Array.isArray(parsed.negativeConstraints)
          ? parsed.negativeConstraints
          : undefined,
        requireSpintax: Boolean(parsed.requireSpintax),
      };
    }
  } catch {
    // Legacy plain-text prompt — fall through to inference.
  }

  const isInfrastructure = /(inbox|mailbox|deliverab|dns|domain|warmup|secondary email)/i.test(
    text
  );
  const company = text.match(/(?:Product\/Company|Company):\s*([^.\n]+)/i)?.[1]?.trim();
  const valueProposition = text.match(
    /(?:Core Value Offer|Value Offer|Value Proposition):\s*([^.\n]+)/i
  )?.[1]?.trim();
  const cta = text.match(/(?:Call to Action|CTA):\s*([^.\n]+)/i)?.[1]?.trim();

  return {
    instruction: text,
    campaignContext: company
      ? {
          companyName: company,
          valueProposition,
          cta,
          isOutboundInfrastructure: isInfrastructure,
        }
      : undefined,
    requireSpintax: /spintax|\{Hi\|/i.test(text),
  };
}

/** Emails already sent to one campaign lead, oldest first (subject and plain body). */
export async function loadSentThread(
  db: EngineDb,
  campaignLeadId: string,
): Promise<Array<{ step: number; subject: string; body: string }>> {
  const rows: Array<{ step: number; subject: string; bodyText: string }> = await db
    .select({ step: schema.emailJobs.stepPosition, subject: schema.emailJobs.subject, bodyText: schema.emailJobs.bodyText })
    .from(schema.emailJobs)
    .where(and(eq(schema.emailJobs.campaignLeadId, campaignLeadId), eq(schema.emailJobs.status, "sent")))
    .orderBy(asc(schema.emailJobs.stepPosition));
  return rows.map((r) => ({ step: Number(r.step) || 1, subject: r.subject || "", body: r.bodyText || "" }));
}

/* ─── Drafts written ahead of sending (drafter.ts) ─────────────────────── */

/** A variant whose email the AI writes per lead. */
export function isAiVariant(v: Pick<SequenceVariantRow, "aiGenerateOnTheFly" | "aiPrompt">): boolean {
  return Boolean(v.aiGenerateOnTheFly && v.aiPrompt?.trim());
}

/** Active (not paused) variants of a step. */
export function activeVariants<T extends { pausedAt?: string | null }>(variants: readonly T[]): T[] {
  return variants.filter((v) => !v.pausedAt);
}

/** A step needs a draft written ahead when any active variant is AI-written. */
export function isAiStep(variants: readonly SequenceVariantRow[]): boolean {
  return activeVariants(variants).some(isAiVariant);
}

/** What the scheduler needs to know about a campaign's AI-written steps. */
export interface AiStepPlan {
  /** Step positions that need a ready draft before they can be claimed. */
  positions: number[];
  /** Active variant ids of those steps (a draft for a paused/removed variant is stale). */
  variantIds: string[];
}

export async function loadAiStepPlan(
  db: EngineDb,
  steps: SequenceStepRow[],
): Promise<{ plan: AiStepPlan; variantsByStep: Map<string, SequenceVariantRow[]> }> {
  const variantsByStep = new Map<string, SequenceVariantRow[]>();
  const plan: AiStepPlan = { positions: [], variantIds: [] };
  for (const step of steps) {
    const variants = await loadStepVariants(db, step.id);
    variantsByStep.set(step.id, variants);
    if (isAiStep(variants)) {
      plan.positions.push(step.position);
      plan.variantIds.push(...activeVariants(variants).map((v) => v.id));
    }
  }
  return { plan, variantsByStep };
}

/** SQL: this row's draft is ready, for its current step, from an active variant. */
export function readyDraftFilter(variantIds: string[]) {
  return and(
    eq(schema.campaignLeads.draftStatus, "ready"),
    eq(schema.campaignLeads.draftStep, schema.campaignLeads.stepPosition),
    variantIds.length > 0 ? inArray(schema.campaignLeads.draftVariantId, variantIds) : sql`1=0`,
  );
}

/** SQL: the row may be claimed (manual step, or an AI step with a ready draft). */
export function claimableDraftFilter(plan: AiStepPlan) {
  if (plan.positions.length === 0) return sql`1=1`;
  return or(notInArray(schema.campaignLeads.stepPosition, plan.positions), readyDraftFilter(plan.variantIds));
}

/** draft_error prefix when the model itself is unavailable (no key, provider down). */
export const WRITING_UNAVAILABLE_PREFIX = "writing-unavailable";
/** campaign_leads.last_error when the AI could not write a lead's email after every retry. */
export const COULD_NOT_WRITE_NOTE = "could-not-write";

/** True when queued leads of this campaign are waiting because the model is unavailable. */
export async function writingUnavailable(db: EngineDb, campaignId: string): Promise<boolean> {
  const rows: Array<{ id: string }> = await db
    .select({ id: schema.campaignLeads.id })
    .from(schema.campaignLeads)
    .where(
      and(
        eq(schema.campaignLeads.campaignId, campaignId),
        eq(schema.campaignLeads.status, "queued"),
        eq(schema.campaignLeads.draftStatus, "failed"),
        like(schema.campaignLeads.draftError, `${WRITING_UNAVAILABLE_PREFIX}%`),
      ),
    )
    .limit(1);
  return Array.isArray(rows) && rows.length > 0;
}

/** Draft columns of a campaign_leads row. */
export interface StoredDraft {
  draftStep: number | null;
  draftVariantId: string | null;
  draftSubject: string | null;
  draftBodyText: string | null;
  draftBodyHtml: string | null;
  draftStatus: string | null;
}

/** Columns that clear a lead's draft (the lead moved on to another step). */
export function clearedDraft() {
  return {
    draftStep: null,
    draftVariantId: null,
    draftSubject: null,
    draftBodyText: null,
    draftBodyHtml: null,
    draftStatus: null,
    draftAttempts: 0,
    draftRetryAt: null,
    draftError: null,
    draftedAt: null,
  };
}

/**
 * Resolve content for a campaign_lead at its current stepPosition.
 * Prefers sequence step+variant when steps exist; else falls back to template.
 * Never calls the AI: an AI-written step uses the lead's ready draft.
 */
export async function resolveStepContent(
  db: EngineDb,
  opts: {
    campaignId: string;
    stepPosition: number;
    templateId: string | null;
    vars: Record<string, string | null | undefined>;
    steps: SequenceStepRow[];
    /** The campaign_leads row, so follow-ups can see what was already sent. */
    campaignLeadId?: string;
    /** The lead's stored draft (required for AI-written steps). */
    draft?: StoredDraft | null;
    /** Variants already loaded for this step (else loaded here). */
    variants?: SequenceVariantRow[];
  },
): Promise<StepContent | { error: string }> {
  const { steps, stepPosition, templateId, vars } = opts;

  if (steps.length > 0) {
    const step = steps.find((s) => s.position === stepPosition);
    if (!step) return { error: "sequence-step-missing" };
    const variants = opts.variants ?? (await loadStepVariants(db, step.id));
    // Follow-ups reply in email 1's thread: same subject as what was actually sent.
    const prior = stepPosition > 1 && opts.campaignLeadId ? await loadSentThread(db, opts.campaignLeadId) : [];
    const firstSubject = prior.find((p) => p.step === 1)?.subject?.trim();
    const threadSubject = firstSubject ? (/^re:/i.test(firstSubject) ? firstSubject : `Re: ${firstSubject}`) : null;

    if (isAiStep(variants)) {
      const d = opts.draft;
      const variant = d ? activeVariants(variants).find((v) => v.id === d.draftVariantId) : undefined;
      if (!d || d.draftStatus !== "ready" || d.draftStep !== stepPosition || !variant || !d.draftBodyText?.trim()) {
        return { error: "draft-missing" };
      }
      const bodyHtml = d.draftBodyHtml?.trim() ? renderWithVarsAndSpintax(d.draftBodyHtml, vars) : "";
      return {
        // A follow-up never changes the thread's subject.
        subject: threadSubject ?? renderWithVarsAndSpintax(d.draftSubject || variant.subject, vars),
        bodyText: renderWithVarsAndSpintax(d.draftBodyText, vars),
        bodyHtml,
        stepPosition,
        sequenceStepId: step.id,
        variantId: variant.id,
        format: bodyHtml.trim() ? "html" : "text",
      };
    }

    const picked = pickVariantEqualWeight(variants);
    if (!picked) return { error: "sequence-variant-missing" };
    return {
      subject: threadSubject ?? renderWithVarsAndSpintax(picked.subject, vars),
      bodyText: renderWithVarsAndSpintax(picked.bodyText, vars),
      bodyHtml: renderWithVarsAndSpintax(picked.bodyHtml, vars),
      stepPosition,
      sequenceStepId: step.id,
      variantId: picked.id,
      format: picked.bodyHtml.trim() ? "html" : "text",
    };
  }

  if (!templateId) return { error: "template-missing" };
  const tplRows: any[] = await db
    .select()
    .from(schema.emailTemplates)
    .where(eq(schema.emailTemplates.id, templateId))
    .limit(1);
  const tpl = tplRows[0];
  if (!tpl) return { error: "template-missing" };
  return {
    subject: renderWithVarsAndSpintax(tpl.subject, vars),
    bodyText: renderWithVarsAndSpintax(tpl.bodyText ?? "", vars),
    bodyHtml: renderWithVarsAndSpintax(tpl.bodyHtml ?? "", vars),
    stepPosition: 1,
    sequenceStepId: null,
    variantId: null,
    format: (tpl.format as "text" | "html") ?? "text",
  };
}

/** Due queued leads: scheduledFor null/blank OR <= now (follow-up waits). */
export function dueQueuedLeadFilter(nowIso: string) {
  return and(
    eq(schema.campaignLeads.status, "queued"),
    or(
      isNull(schema.campaignLeads.scheduledFor),
      sql`${schema.campaignLeads.scheduledFor} = ''`,
      lte(schema.campaignLeads.scheduledFor, nowIso),
    ),
  );
}

/** After a successful send: requeue next step or mark lead sent. */
export async function advanceSequenceAfterSend(
  db: EngineDb,
  opts: {
    campaignId: string;
    campaignLeadId: string;
    stepPosition: number;
    sentAt: string;
    steps: SequenceStepRow[];
  },
): Promise<"completed" | "requeued"> {
  const { campaignId, campaignLeadId, stepPosition, sentAt, steps } = opts;
  const next = steps.find((s) => s.position === stepPosition + 1);
  // Only a lead still 'scheduled' (this send's claim) moves on. A reply,
  // unsubscribe or cancel that landed while the email was in flight already
  // changed the status; it wins, and no follow-up is queued.
  const stillScheduled = and(
    eq(schema.campaignLeads.id, campaignLeadId),
    eq(schema.campaignLeads.status, "scheduled"),
  );
  if (!next || steps.length === 0) {
    await db
      .update(schema.campaignLeads)
      .set({
        status: "sent",
        sentAt,
        attempts: sql`${schema.campaignLeads.attempts} + 1`,
        lastError: null,
        ...clearedDraft(),
        updatedAt: sentAt,
      })
      .where(stillScheduled);
    return "completed";
  }

  const due = addCalendarDays(new Date(sentAt), next.delayDays).toISOString();
  const requeued: { id: string }[] = await db
    .update(schema.campaignLeads)
    .set({
      status: "queued",
      stepPosition: next.position,
      scheduledFor: due,
      sentAt,
      attempts: sql`${schema.campaignLeads.attempts} + 1`,
      lastError: null,
      // The draft was for the step just sent; the drafter writes the next one.
      ...clearedDraft(),
      updatedAt: sentAt,
    })
    .where(stillScheduled)
    .returning({ id: schema.campaignLeads.id });
  return requeued.length > 0 ? "requeued" : "completed";
}

export { pickVariantEqualWeight, addCalendarDays };

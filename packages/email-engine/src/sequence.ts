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
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { EngineDb } from "./db-port";

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
 * Resolve content for a campaign_lead at its current stepPosition.
 * Prefers sequence step+variant when steps exist; else falls back to template.
 */
export async function resolveStepContent(
  db: EngineDb,
  opts: {
    campaignId: string;
    stepPosition: number;
    templateId: string | null;
    vars: Record<string, string | null | undefined>;
    steps: SequenceStepRow[];
  },
): Promise<StepContent | { error: string }> {
  const { steps, stepPosition, templateId, vars } = opts;

  if (steps.length > 0) {
    const step = steps.find((s) => s.position === stepPosition);
    if (!step) return { error: "sequence-step-missing" };
    const variants = await loadStepVariants(db, step.id);
    const picked = pickVariantEqualWeight(variants);
    if (!picked) return { error: "sequence-variant-missing" };
    return {
      subject: renderWithVarsAndSpintax(picked.subject, vars),
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
  if (!next || steps.length === 0) {
    await db
      .update(schema.campaignLeads)
      .set({
        status: "sent",
        sentAt,
        attempts: sql`${schema.campaignLeads.attempts} + 1`,
        lastError: null,
        updatedAt: sentAt,
      })
      .where(eq(schema.campaignLeads.id, campaignLeadId));
    return "completed";
  }

  const due = addCalendarDays(new Date(sentAt), next.delayDays).toISOString();
  await db
    .update(schema.campaignLeads)
    .set({
      status: "queued",
      stepPosition: next.position,
      scheduledFor: due,
      sentAt,
      attempts: sql`${schema.campaignLeads.attempts} + 1`,
      lastError: null,
      updatedAt: sentAt,
    })
    .where(eq(schema.campaignLeads.id, campaignLeadId));
  return "requeued";
}

export { pickVariantEqualWeight, addCalendarDays };

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
import { generateEmailScriptOnTheFly, type LeadProfile } from "./ai";

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
    lead?: any;
    senderName?: string;
    aiOptions?: {
      apiKey?: string | null;
      provider?: string;
      model?: string;
    };
  },
): Promise<StepContent | { error: string }> {
  const { steps, stepPosition, templateId, vars, lead, senderName, aiOptions } = opts;

  if (steps.length > 0) {
    const step = steps.find((s) => s.position === stepPosition);
    if (!step) return { error: "sequence-step-missing" };
    const variants = await loadStepVariants(db, step.id);
    const picked = pickVariantEqualWeight(variants);
    if (!picked) return { error: "sequence-variant-missing" };

    let finalSubject = renderWithVarsAndSpintax(picked.subject, vars);
    let finalBodyText = renderWithVarsAndSpintax(picked.bodyText, vars);
    let finalBodyHtml = renderWithVarsAndSpintax(picked.bodyHtml, vars);
    let format: "text" | "html" = picked.bodyHtml.trim() ? "html" : "text";

    if (picked.aiGenerateOnTheFly && picked.aiPrompt?.trim()) {
      try {
        const leadProfile: LeadProfile = {
          email: vars.email || lead?.email || "",
          firstName: vars.first_name || lead?.firstName || null,
          lastName: vars.last_name || lead?.lastName || null,
          company: vars.company || lead?.company || null,
          jobTitle: vars.job_title || lead?.jobTitle || null,
          website: vars.website || lead?.website || null,
          industry: vars.industry || lead?.industry || null,
          location: vars.location || lead?.location || null,
          customFields: lead?.customFields || null,
        };

        const generated = await generateEmailScriptOnTheFly({
          lead: leadProfile,
          customInstruction: picked.aiPrompt,
          senderName,
          fallbackSubject: finalSubject,
          fallbackBody: finalBodyText,
          vars,
          apiKey: aiOptions?.apiKey,
          provider: aiOptions?.provider,
          model: aiOptions?.model,
        });

        if (generated.subject) {
          finalSubject = renderWithVarsAndSpintax(generated.subject, vars);
        }
        if (generated.bodyText) {
          finalBodyText = renderWithVarsAndSpintax(generated.bodyText, vars);
          finalBodyHtml = generated.bodyHtml
            ? renderWithVarsAndSpintax(generated.bodyHtml, vars)
            : `<p>${finalBodyText.replace(/\n/g, "<br>")}</p>`;
          format = "html";
        }
      } catch (aiErr) {
        console.warn("[scheduler] AI script generation error, falling back to baseline template:", aiErr);
      }
    }

    return {
      subject: finalSubject,
      bodyText: finalBodyText,
      bodyHtml: finalBodyHtml,
      stepPosition,
      sequenceStepId: step.id,
      variantId: picked.id,
      format,
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

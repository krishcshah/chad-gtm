/**
 * Campaign sequence CRUD (F19) — thin API for Prism step rail + preview.
 * Pure of Next.js session/revalidate so unit tests can inject a db.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { expandSpintax, pickVariantEqualWeight, renderTemplate, schema } from "@smartreach/database";
export { pickVariantEqualWeight };
import { MAX_SEQUENCE_STEPS, nowIso } from "@smartreach/shared";
import {
  sequencePreviewSchema,
  sequenceSaveSchema,
  type SequencePreviewInput,
  type SequenceSaveInput,
} from "@smartreach/validation";
import { formatZodActionError } from "./zod-action-error";

const { campaigns, sequenceSteps, sequenceStepVariants } = schema;

export type SequenceActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Db = {
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
  select: (...args: any[]) => any;
  transaction?: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
};

function zodFail(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): SequenceActionResult<never> {
  const { error: message, fieldErrors } = formatZodActionError(error.issues);
  return { ok: false, error: message, fieldErrors };
}

export type SequenceVariantDTO = {
  id: string;
  label: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  weight: number;
  pausedAt: string | null;
};

export type SequenceStepDTO = {
  id: string;
  position: number;
  delayDays: number;
  type: "initial" | "follow_up";
  variants: SequenceVariantDTO[];
};

export type SequenceDTO = {
  campaignId: string;
  steps: SequenceStepDTO[];
};

/** Load ordered steps + variants for a campaign owned by userId. */
export async function getCampaignSequenceForUser(
  db: Db,
  userId: string,
  campaignId: string,
): Promise<SequenceActionResult<SequenceDTO>> {
  const rows = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, userId)));
  if (!rows[0]) return { ok: false, error: "Campaign not found" };

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaignId))
    .orderBy(asc(sequenceSteps.position));

  const stepIds = steps.map((s: { id: string }) => s.id);
  const variants =
    stepIds.length === 0
      ? []
      : await db
          .select()
          .from(sequenceStepVariants)
          .where(inArray(sequenceStepVariants.stepId, stepIds))
          .orderBy(asc(sequenceStepVariants.label));

  const byStep = new Map<string, SequenceVariantDTO[]>();
  for (const v of variants) {
    const list = byStep.get(v.stepId) ?? [];
    list.push({
      id: v.id,
      label: v.label,
      subject: v.subject,
      bodyHtml: v.bodyHtml,
      bodyText: v.bodyText,
      weight: v.weight,
      pausedAt: v.pausedAt ?? null,
    });
    byStep.set(v.stepId, list);
  }

  return {
    ok: true,
    data: {
      campaignId,
      steps: steps.map((s: any) => ({
        id: s.id,
        position: s.position,
        delayDays: s.delayDays,
        type: s.type as "initial" | "follow_up",
        variants: byStep.get(s.id) ?? [],
      })),
    },
  };
}

/**
 * Replace-all save for the Prism step rail.
 * Deletes existing steps (cascade variants) and inserts the provided tree.
 * Empty steps[] clears the sequence (engine falls back to campaign.templateId).
 */
export async function saveCampaignSequenceForUser(
  db: Db,
  userId: string,
  input: unknown,
): Promise<SequenceActionResult<SequenceDTO>> {
  const parsed = sequenceSaveSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);

  const data = parsed.data as SequenceSaveInput;
  if (data.steps.length > MAX_SEQUENCE_STEPS) {
    return { ok: false, error: `Max ${MAX_SEQUENCE_STEPS} steps per sequence` };
  }

  const owned = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(eq(campaigns.id, data.campaignId), eq(campaigns.userId, userId)));
  if (!owned[0]) return { ok: false, error: "Campaign not found" };

  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i]!;
    if (step.variants.length < 1 || step.variants.length > 2) {
      return {
        ok: false,
        error: `Step ${i + 1}: provide 1 variant, or 2 for A/B`,
        fieldErrors: { [`steps.${i}.variants`]: ["1 or 2 variants required"] },
      };
    }
  }

  const now = nowIso();
  const run = async (tx: Db) => {
    await tx.delete(sequenceSteps).where(eq(sequenceSteps.campaignId, data.campaignId));

    const outSteps: SequenceStepDTO[] = [];
    for (let i = 0; i < data.steps.length; i++) {
      const stepIn = data.steps[i]!;
      const position = i + 1;
      const stepId = stepIn.id ?? crypto.randomUUID();
      const type = stepIn.type ?? (position === 1 ? "initial" : "follow_up");
      const delayDays = stepIn.delayDays ?? 0;

      await tx.insert(sequenceSteps).values({
        id: stepId,
        campaignId: data.campaignId,
        position,
        delayDays,
        type,
        createdAt: now,
        updatedAt: now,
      });

      const outVariants: SequenceVariantDTO[] = [];
      for (let vi = 0; vi < stepIn.variants.length; vi++) {
        const vIn = stepIn.variants[vi]!;
        const variantId = vIn.id ?? crypto.randomUUID();
        const label =
          stepIn.variants.length === 2
            ? (["A", "B"][vi] as string)
            : vIn.label || "A";
        // Equal-weight A/B: force 50/50 when two variants present
        const weight = stepIn.variants.length === 2 ? 50 : (vIn.weight ?? 50);
        const pausedAt = vIn.pausedAt ?? null;
        await tx.insert(sequenceStepVariants).values({
          id: variantId,
          stepId,
          label,
          subject: vIn.subject ?? "",
          bodyHtml: vIn.bodyHtml ?? "",
          bodyText: vIn.bodyText ?? "",
          weight,
          pausedAt,
          createdAt: now,
          updatedAt: now,
        });
        outVariants.push({
          id: variantId,
          label,
          subject: vIn.subject ?? "",
          bodyHtml: vIn.bodyHtml ?? "",
          bodyText: vIn.bodyText ?? "",
          weight,
          pausedAt,
        });
      }
      outSteps.push({
        id: stepId,
        position,
        delayDays,
        type: type as "initial" | "follow_up",
        variants: outVariants,
      });
    }
    return outSteps;
  };

  const steps = db.transaction ? await db.transaction(run) : await run(db);
  return { ok: true, data: { campaignId: data.campaignId, steps } };
}

/** Resolve {{vars}} then expand spintax for Prism preview pane. */
export function previewSequenceContent(input: unknown): SequenceActionResult<{
  subject: string;
  bodyHtml: string;
  bodyText: string;
}> {
  const parsed = sequencePreviewSchema.safeParse(input);
  if (!parsed.success) return zodFail(parsed.error);
  const data = parsed.data as SequencePreviewInput;
  const vars = data.sampleVars ?? {
    first_name: "Alex",
    last_name: "Doe",
    company: "Acme",
    email: "alex@example.com",
  };
  const render = (s: string) => expandSpintax(renderTemplate(s, vars));
  return {
    ok: true,
    data: {
      subject: render(data.subject),
      bodyHtml: render(data.bodyHtml),
      bodyText: render(data.bodyText),
    },
  };
}

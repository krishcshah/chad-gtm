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
  /**
   * Interactive transactions. Works on node-postgres. On drizzle neon-http the
   * method exists and throws "No transactions support in neon-http driver".
   */
  transaction?: <T>(fn: (tx: Db) => Promise<T>) => Promise<T>;
};

type QueryLike = PromiseLike<unknown>;

/**
 * drizzle neon-http `batch` → `@neondatabase/serverless` `sql.transaction(queries)`.
 * That is one HTTP request (`{ queries: [...] }`) which Neon runs as a single
 * transaction. Absent on node-postgres.
 */
function readNeonHttpBatch(
  db: Db,
): ((queries: readonly QueryLike[]) => Promise<unknown>) | null {
  const batch = (db as { batch?: unknown }).batch;
  if (typeof batch !== "function") return null;
  return (queries) =>
    (batch as (q: readonly QueryLike[]) => Promise<unknown>).call(db, queries);
}

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

type PlannedVariant = {
  row: {
    id: string;
    stepId: string;
    label: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    weight: number;
    pausedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  dto: SequenceVariantDTO;
};

type PlannedStep = {
  row: {
    id: string;
    campaignId: string;
    position: number;
    delayDays: number;
    type: "initial" | "follow_up";
    createdAt: string;
    updatedAt: string;
  };
  variants: PlannedVariant[];
  dto: SequenceStepDTO;
};

/**
 * Statements for a replace-all write, in FK-safe order:
 * delete steps (variants cascade), then each step, then its variants.
 * Ids are assigned in JS, so the list does not depend on RETURNING.
 */
function replacementQueries(executor: Db, campaignId: string, planned: PlannedStep[]): QueryLike[] {
  const queries: QueryLike[] = [
    executor.delete(sequenceSteps).where(eq(sequenceSteps.campaignId, campaignId)),
  ];
  for (const step of planned) {
    queries.push(executor.insert(sequenceSteps).values(step.row));
    for (const variant of step.variants) {
      queries.push(executor.insert(sequenceStepVariants).values(variant.row));
    }
  }
  return queries;
}

/**
 * Neon HTTP has no interactive transaction. `db.batch` is the atomic primitive
 * (one neon `sql.transaction` HTTP round-trip). node-postgres uses
 * `db.transaction`. A driver with neither runs the statements sequentially;
 * that path is not atomic.
 */
async function persistSequenceReplacement(
  db: Db,
  campaignId: string,
  planned: PlannedStep[],
): Promise<void> {
  const batch = readNeonHttpBatch(db);
  if (batch) {
    await batch(replacementQueries(db, campaignId, planned));
    return;
  }
  if (typeof db.transaction === "function") {
    await db.transaction(async (tx) => {
      for (const query of replacementQueries(tx, campaignId, planned)) await query;
    });
    return;
  }
  for (const query of replacementQueries(db, campaignId, planned)) await query;
}

/**
 * Replace-all save for the Prism step rail.
 * Deletes existing steps (ON DELETE CASCADE removes variants) and inserts the tree.
 * Empty steps[] clears the sequence (engine falls back to campaign.templateId).
 *
 * Partial failure:
 * - Neon HTTP (staging/production): one `db.batch` / neon `sql.transaction`.
 *   All statements commit or none do. Interactive `db.transaction` throws
 *   "No transactions support in neon-http driver" and is not used.
 *   Residual risk: the HTTP response can be lost after the server commits.
 *   Retry is replace-all, so the same ids are idempotent and new ids still
 *   converge to the submitted tree.
 * - node-postgres (local): the same replace-all inside `db.transaction`.
 * - Neither primitive: sequential statements, not atomic. A failure after
 *   DELETE can leave the sequence empty or partial until a later save.
 *   No schema change; cascades stay on the existing foreign keys.
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
  const planned: PlannedStep[] = [];
  for (let i = 0; i < data.steps.length; i++) {
    const stepIn = data.steps[i]!;
    const position = i + 1;
    const stepId = stepIn.id ?? crypto.randomUUID();
    const type = (stepIn.type ?? (position === 1 ? "initial" : "follow_up")) as
      | "initial"
      | "follow_up";
    const delayDays = stepIn.delayDays ?? 0;
    const variants: PlannedVariant[] = [];
    for (let vi = 0; vi < stepIn.variants.length; vi++) {
      const vIn = stepIn.variants[vi]!;
      const variantId = vIn.id ?? crypto.randomUUID();
      const label =
        stepIn.variants.length === 2 ? (["A", "B"][vi] as string) : vIn.label || "A";
      // Equal-weight A/B: force 50/50 when two variants present
      const weight = stepIn.variants.length === 2 ? 50 : (vIn.weight ?? 50);
      const pausedAt = vIn.pausedAt ?? null;
      const dto: SequenceVariantDTO = {
        id: variantId,
        label,
        subject: vIn.subject ?? "",
        bodyHtml: vIn.bodyHtml ?? "",
        bodyText: vIn.bodyText ?? "",
        weight,
        pausedAt,
      };
      variants.push({
        dto,
        row: {
          ...dto,
          stepId,
          createdAt: now,
          updatedAt: now,
        },
      });
    }
    planned.push({
      row: {
        id: stepId,
        campaignId: data.campaignId,
        position,
        delayDays,
        type,
        createdAt: now,
        updatedAt: now,
      },
      variants,
      dto: {
        id: stepId,
        position,
        delayDays,
        type,
        variants: variants.map((variant) => variant.dto),
      },
    });
  }

  await persistSequenceReplacement(db, data.campaignId, planned);
  return {
    ok: true,
    data: { campaignId: data.campaignId, steps: planned.map((step) => step.dto) },
  };
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

import { beforeEach, describe, expect, it } from "vitest";
import {
  getCampaignSequenceForUser,
  saveCampaignSequenceForUser,
} from "../sequences";

/**
 * Regression for staging F19 save HTTP 500:
 * drizzle neon-http defines `transaction()` and it throws
 * "No transactions support in neon-http driver". Persistence must use
 * `batch` (neon HTTP `sql.transaction`) and must not call `transaction`.
 */

type CampaignRow = { id: string; userId: string };
type StepRow = {
  id: string;
  campaignId: string;
  position: number;
  delayDays: number;
  type: "initial" | "follow_up";
  createdAt: string;
  updatedAt: string;
};
type VariantRow = {
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

type Store = {
  campaigns: CampaignRow[];
  steps: StepRow[];
  variants: VariantRow[];
};

type Mode = "neon-http" | "node-postgres" | "sequential";

const NEON_TX_ERROR = "No transactions support in neon-http driver";

let store: Store;
let throwOnStatement: number | null;
let statementIndex: number;
let transactionCalls: number;
let batchCalls: number;
let batchSizes: number[];

function snapshot(): Store {
  return structuredClone(store);
}

function restore(next: Store) {
  store.campaigns = next.campaigns;
  store.steps = next.steps;
  store.variants = next.variants;
}

function isParam(value: unknown): value is { value: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { constructor?: { name?: string } }).constructor?.name === "Param" &&
    "value" in value
  );
}

function isColumn(value: unknown): value is { name: string; table: object } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { name?: unknown }).name === "string" &&
    typeof (value as { table?: unknown }).table === "object" &&
    (value as { table?: unknown }).table !== null
  );
}

function isStringChunk(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { constructor?: { name?: string } }).constructor?.name === "StringChunk"
  );
}

function paramsAfter(chunks: unknown[], start: number): unknown[] {
  const params: unknown[] = [];
  for (let j = start; j < chunks.length; j++) {
    const chunk = chunks[j];
    if (Array.isArray(chunk)) {
      for (const item of chunk) {
        if (!isParam(item)) return params;
        params.push(item.value);
      }
      continue;
    }
    if (isParam(chunk)) {
      params.push(chunk.value);
      continue;
    }
    if (isStringChunk(chunk)) continue;
    break;
  }
  return params;
}

/** eq() and inArray() filters, keyed by SQL column name. Values are IN-lists. */
function extractFilters(cond: unknown): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const chunks = (node as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(chunks)) return;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (isColumn(chunk)) {
        const params = paramsAfter(chunks, i + 1);
        if (params.length) out[chunk.name] = (out[chunk.name] ?? []).concat(params);
        continue;
      }
      visit(chunk);
    }
  };
  visit(cond);
  return out;
}

function camel(column: string): string {
  return column.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function cell(row: Record<string, unknown>, column: string): unknown {
  if (column in row) return row[column];
  const key = camel(column);
  return row[key];
}

function matches(row: Record<string, unknown>, filters: Record<string, unknown[]>): boolean {
  for (const [column, expected] of Object.entries(filters)) {
    if (!expected.includes(cell(row, column))) return false;
  }
  return true;
}

function resolveTable(table: Record<string | symbol, unknown>): string {
  const named = table?.[Symbol.for("drizzle:Name")];
  if (typeof named === "string") return named;
  return "unknown";
}

function beforeMutate() {
  statementIndex += 1;
  if (throwOnStatement === statementIndex) {
    throw new Error("injected write failure");
  }
}

function deleteSteps(filters: Record<string, unknown[]>) {
  beforeMutate();
  const removed = store.steps.filter((row) => matches(row, filters));
  const removedIds = new Set(removed.map((row) => row.id));
  store.steps = store.steps.filter((row) => !removedIds.has(row.id));
  // sequence_step_variants.step_id ON DELETE CASCADE
  store.variants = store.variants.filter((row) => !removedIds.has(row.stepId));
}

function insertStep(row: StepRow) {
  beforeMutate();
  if (store.steps.some((step) => step.id === row.id)) {
    throw new Error(`duplicate step id ${row.id}`);
  }
  if (store.steps.some((step) => step.campaignId === row.campaignId && step.position === row.position)) {
    throw new Error(`duplicate position ${row.position} on ${row.campaignId}`);
  }
  store.steps.push({ ...row });
}

function insertVariant(row: VariantRow) {
  beforeMutate();
  if (!store.steps.some((step) => step.id === row.stepId)) {
    throw new Error(`variant ${row.id} references missing step ${row.stepId}`);
  }
  if (store.variants.some((variant) => variant.id === row.id)) {
    throw new Error(`duplicate variant id ${row.id}`);
  }
  if (store.variants.some((variant) => variant.stepId === row.stepId && variant.label === row.label)) {
    throw new Error(`duplicate label ${row.label} on ${row.stepId}`);
  }
  store.variants.push({ ...row });
}

function query(run: () => void) {
  return {
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve()
        .then(() => {
          run();
          return [];
        })
        .then(resolve, reject);
    },
  };
}

function createDb(mode: Mode) {
  const db = {
    select(shape?: Record<string, unknown>) {
      const ctx: { table: string; filters: Record<string, unknown[]>; shape?: Record<string, unknown> } =
        { table: "", filters: {}, shape };
      const chain = {
        from(table: Record<string | symbol, unknown>) {
          ctx.table = resolveTable(table);
          return chain;
        },
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        orderBy() {
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              let rows: Record<string, unknown>[] = [];
              if (ctx.table === "campaigns") rows = store.campaigns;
              else if (ctx.table === "sequence_steps") rows = store.steps;
              else if (ctx.table === "sequence_step_variants") rows = store.variants;
              rows = rows.filter((row) => matches(row, ctx.filters)).map((row) => ({ ...row }));
              if (ctx.table === "sequence_steps") {
                rows.sort((a, b) => Number(a.position) - Number(b.position));
              }
              if (ctx.table === "sequence_step_variants") {
                rows.sort((a, b) => String(a.label).localeCompare(String(b.label)));
              }
              if (ctx.shape) {
                const keys = Object.keys(ctx.shape);
                return rows.map((row) => {
                  const picked: Record<string, unknown> = {};
                  for (const key of keys) picked[key] = row[key];
                  return picked;
                });
              }
              return rows;
            })
            .then(resolve, reject);
        },
      };
      return chain;
    },
    insert(table: Record<string | symbol, unknown>) {
      const name = resolveTable(table);
      let values: Record<string, unknown> | null = null;
      const chain = {
        values(row: Record<string, unknown>) {
          values = row;
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return query(() => {
            if (!values) throw new Error("insert without values");
            if (name === "sequence_steps") insertStep(values as StepRow);
            else if (name === "sequence_step_variants") insertVariant(values as VariantRow);
            else throw new Error(`unexpected insert ${name}`);
          }).then(resolve, reject);
        },
      };
      return chain;
    },
    delete(table: Record<string | symbol, unknown>) {
      const name = resolveTable(table);
      let filters: Record<string, unknown[]> = {};
      const chain = {
        where(cond: unknown) {
          filters = extractFilters(cond);
          return chain;
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return query(() => {
            if (name !== "sequence_steps") throw new Error(`unexpected delete ${name}`);
            deleteSteps(filters);
          }).then(resolve, reject);
        },
      };
      return chain;
    },
    update() {
      throw new Error("sequence save does not update rows");
    },
    async transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      transactionCalls += 1;
      if (mode === "neon-http") throw new Error(NEON_TX_ERROR);
      const snap = snapshot();
      statementIndex = 0;
      try {
        return await fn(db);
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
    async batch(queries: PromiseLike<unknown>[]) {
      if (mode !== "neon-http") throw new Error("batch is neon-http only");
      batchCalls += 1;
      batchSizes.push(queries.length);
      statementIndex = 0;
      const snap = snapshot();
      try {
        for (const statement of queries) await statement;
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
  };

  if (mode === "node-postgres") {
    delete (db as { batch?: unknown }).batch;
  }
  if (mode === "sequential") {
    delete (db as { batch?: unknown }).batch;
    delete (db as { transaction?: unknown }).transaction;
  }
  return db;
}

function seedOwnedCampaign() {
  store.campaigns.push({ id: "camp-a", userId: "user-a" }, { id: "camp-b", userId: "user-b" });
  store.steps.push(
    {
      id: "old-step",
      campaignId: "camp-a",
      position: 1,
      delayDays: 0,
      type: "initial",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "other-step",
      campaignId: "camp-b",
      position: 1,
      delayDays: 2,
      type: "initial",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  );
  store.variants.push(
    {
      id: "old-variant",
      stepId: "old-step",
      label: "A",
      subject: "Old",
      bodyHtml: "<p>Old</p>",
      bodyText: "Old",
      weight: 50,
      pausedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "other-variant",
      stepId: "other-step",
      label: "A",
      subject: "Other",
      bodyHtml: "",
      bodyText: "Other",
      weight: 50,
      pausedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  );
}

beforeEach(() => {
  store = { campaigns: [], steps: [], variants: [] };
  throwOnStatement = null;
  statementIndex = 0;
  transactionCalls = 0;
  batchCalls = 0;
  batchSizes = [];
  seedOwnedCampaign();
});

describe("saveCampaignSequenceForUser neon-http", () => {
  it("does not call transaction and persists a replace-all through batch", async () => {
    const db = createDb("neon-http");
    await expect(db.transaction(async () => "unused")).rejects.toThrow(NEON_TX_ERROR);
    transactionCalls = 0;

    const saved = await saveCampaignSequenceForUser(db, "user-a", {
      campaignId: "camp-a",
      steps: [
        {
          id: "step-1",
          delayDays: 0,
          type: "initial",
          variants: [
            {
              id: "var-a",
              subject: "Hello {{first_name}}",
              bodyText: "{Hi|Hello}",
              bodyHtml: "<p>{Hi|Hello}</p>",
            },
          ],
        },
        {
          delayDays: 3,
          type: "follow_up",
          variants: [
            { subject: "Ping", bodyText: "Ping", label: "Z" },
            { subject: "Pong", bodyText: "Pong", weight: 90, label: "Y" },
          ],
        },
      ],
    });

    expect(transactionCalls).toBe(0);
    expect(batchCalls).toBe(1);
    // delete + step + variant + step + variant + variant
    expect(batchSizes).toEqual([6]);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.data!.steps.map((step) => step.position)).toEqual([1, 2]);
    expect(saved.data!.steps[1]!.delayDays).toBe(3);
    expect(saved.data!.steps[1]!.variants.map((variant) => variant.label)).toEqual(["A", "B"]);
    expect(saved.data!.steps[1]!.variants.map((variant) => variant.weight)).toEqual([50, 50]);

    const loaded = await getCampaignSequenceForUser(db, "user-a", "camp-a");
    expect(loaded).toEqual(saved);
    expect(store.steps.map((step) => step.id).sort()).toEqual(
      ["step-1", saved.data!.steps[1]!.id, "other-step"].sort(),
    );
    expect(store.variants.map((variant) => variant.id)).not.toContain("old-variant");
    expect(store.variants.map((variant) => variant.id)).toContain("other-variant");
    expect(store.variants.find((variant) => variant.stepId === "other-step")?.subject).toBe("Other");
  });

  it("rolls the whole batch back when a later insert fails", async () => {
    const db = createDb("neon-http");
    throwOnStatement = 2;
    const before = snapshot();

    await expect(
      saveCampaignSequenceForUser(db, "user-a", {
        campaignId: "camp-a",
        steps: [
          {
            variants: [{ subject: "Next", bodyText: "Next" }],
          },
        ],
      }),
    ).rejects.toThrow("injected write failure");

    expect(transactionCalls).toBe(0);
    expect(batchCalls).toBe(1);
    expect(store).toEqual(before);
  });

  it("clears a sequence in one batch and leaves other campaigns alone", async () => {
    const db = createDb("neon-http");
    const saved = await saveCampaignSequenceForUser(db, "user-a", {
      campaignId: "camp-a",
      steps: [],
    });
    expect(saved.ok).toBe(true);
    expect(batchSizes).toEqual([1]);
    expect(store.steps.map((step) => step.id)).toEqual(["other-step"]);
    expect(store.variants.map((variant) => variant.id)).toEqual(["other-variant"]);

    const loaded = await getCampaignSequenceForUser(db, "user-a", "camp-a");
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.data!.steps).toEqual([]);
  });

  it("refuses another tenant without writing", async () => {
    const db = createDb("neon-http");
    const before = snapshot();
    const saved = await saveCampaignSequenceForUser(db, "user-a", {
      campaignId: "camp-b",
      steps: [{ variants: [{ subject: "Nope", bodyText: "Nope" }] }],
    });
    expect(saved).toEqual({ ok: false, error: "Campaign not found" });
    expect(batchCalls).toBe(0);
    expect(transactionCalls).toBe(0);
    expect(store).toEqual(before);

    const loaded = await getCampaignSequenceForUser(db, "user-a", "camp-b");
    expect(loaded).toEqual({ ok: false, error: "Campaign not found" });
    const owner = await getCampaignSequenceForUser(db, "user-b", "camp-b");
    expect(owner.ok).toBe(true);
    if (owner.ok) expect(owner.data!.steps.map((step) => step.id)).toEqual(["other-step"]);
  });
});

describe("saveCampaignSequenceForUser other drivers", () => {
  it("uses an interactive transaction on node-postgres", async () => {
    const db = createDb("node-postgres");
    const saved = await saveCampaignSequenceForUser(db, "user-a", {
      campaignId: "camp-a",
      steps: [{ id: "pg-step", variants: [{ id: "pg-var", subject: "Local", bodyText: "Local" }] }],
    });
    expect(saved.ok).toBe(true);
    expect(transactionCalls).toBe(1);
    expect(batchCalls).toBe(0);
    expect(store.steps.map((step) => step.id).sort()).toEqual(["other-step", "pg-step"]);
    expect(store.variants.some((variant) => variant.id === "old-variant")).toBe(false);
  });

  it("sequential fallback commits the delete before a later failure", async () => {
    const db = createDb("sequential");
    throwOnStatement = 2;
    await expect(
      saveCampaignSequenceForUser(db, "user-a", {
        campaignId: "camp-a",
        steps: [{ variants: [{ subject: "Next", bodyText: "Next" }] }],
      }),
    ).rejects.toThrow("injected write failure");
    expect(batchCalls).toBe(0);
    expect(transactionCalls).toBe(0);
    expect(store.steps.map((step) => step.id)).toEqual(["other-step"]);
    expect(store.variants.map((variant) => variant.id)).toEqual(["other-variant"]);
  });
});

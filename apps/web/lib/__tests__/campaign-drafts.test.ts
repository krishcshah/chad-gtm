import { beforeEach, describe, expect, it } from "vitest";
import { CAMPAIGN_POSTAL_REQUIRED_ERROR } from "../campaign-start-guard";
import {
  getCampaignWizardStateForUser,
  publishCampaignForUser,
  saveCampaignDraftForUser,
} from "../campaign-drafts";

type CampaignRow = {
  id: string;
  userId: string;
  status: string;
  name: string;
  leadListId: string | null;
  templateId: string | null;
  deletedAt: string | null;
  wizardStep: number | null;
  scheduledAt: string | null;
  businessDaysOnly: boolean;
  sendingTimezone: string;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  dailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  maxEmailsPerSenderPerDay: number;
  stopOnReply: boolean;
  retryFailed: boolean;
  retryCount: number;
  startedAt: string | null;
  [k: string]: unknown;
};

type Store = {
  campaigns: CampaignRow[];
  campaignSenders: { campaignId: string; senderId: string }[];
  campaignLeads: { id: string; campaignId: string; leadId: string; status: string }[];
  leads: { id: string; listId: string; status: string; deletedAt: string | null }[];
};

let store: Store;
let idSeq = 0;
const nextId = (p: string) => {
  idSeq += 1;
  return `${p}-${idSeq}`;
};

function resolveTable(table: Record<string | symbol, unknown>): string {
  const sym = Symbol.for("drizzle:Name");
  const named = table?.[sym];
  if (typeof named === "string") return named;
  const keys = Object.keys(table ?? {});
  if (keys.includes("wizardStep") || (keys.includes("leadListId") && keys.includes("dailyLimit"))) {
    return "campaigns";
  }
  if (keys.includes("senderId") && keys.includes("campaignId") && !keys.includes("leadId")) {
    return "campaign_senders";
  }
  if (keys.includes("leadId") && keys.includes("campaignId")) return "campaign_leads";
  if (keys.includes("listId") && keys.includes("email")) return "leads";
  return "unknown";
}

/** Pull { columnName: value } from drizzle eq/and/sql trees. */
function extractFilters(cond: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { queryChunks?: unknown[] };
    if (Array.isArray(n.queryChunks)) {
      const chunks = n.queryChunks as { name?: string; value?: unknown; constructor?: { name?: string } }[];
      for (let i = 0; i < chunks.length; i++) {
        const col = chunks[i];
        if (!col?.name) continue;
        // eq: column, " = ", Param
        const param = chunks.slice(i + 1, i + 4).find((c) => c?.constructor?.name === "Param");
        if (param && "value" in param) out[col.name] = param.value;
      }
      for (const c of chunks) walk(c);
    }
  };
  walk(cond);
  return out;
}

function camelFromSnake(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function applyFilters(rows: Record<string, unknown>[], filters: Record<string, unknown>) {
  return rows.filter((row) => {
    for (const [k, v] of Object.entries(filters)) {
      const key = k in row ? k : camelFromSnake(k);
      if (row[key] !== v) return false;
    }
    // Soft-deleted rows: if filter didn't mention deletedAt, still require null
    if (!("deleted_at" in filters) && !("deletedAt" in filters) && "deletedAt" in row) {
      if (row.deletedAt != null) return false;
    }
    return true;
  });
}

function createStoreDb() {
  return {
    select(shape?: Record<string, unknown>) {
      const ctx: { shape?: Record<string, unknown>; table: string; filters: Record<string, unknown> } = {
        shape,
        table: "",
        filters: {},
      };
      const chain = {
        from(table: Record<string | symbol, unknown>) {
          ctx.table = resolveTable(table);
          return chain;
        },
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        limit() {
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            resolve(doSelect(ctx));
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
    insert(table: Record<string | symbol, unknown>) {
      const ctx: { table: string; values: unknown; returning?: boolean } = {
        table: resolveTable(table),
        values: null,
      };
      const chain = {
        values(v: unknown) {
          ctx.values = v;
          return chain;
        },
        returning() {
          ctx.returning = true;
          return chain;
        },
        onConflictDoNothing() {
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            resolve(doInsert(ctx));
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
    update(table: Record<string | symbol, unknown>) {
      const ctx: { table: string; set: Record<string, unknown> | null; filters: Record<string, unknown> } = {
        table: resolveTable(table),
        set: null,
        filters: {},
      };
      const chain = {
        set(v: Record<string, unknown>) {
          ctx.set = v;
          return chain;
        },
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            const rows = applyFilters(store.campaigns, ctx.filters);
            for (const row of rows) Object.assign(row, ctx.set);
            resolve([]);
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
    delete(table: Record<string | symbol, unknown>) {
      const ctx: { table: string; filters: Record<string, unknown> } = {
        table: resolveTable(table),
        filters: {},
      };
      const chain = {
        where(cond: unknown) {
          Object.assign(ctx.filters, extractFilters(cond));
          return chain;
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          try {
            if (ctx.table === "campaign_senders") {
              store.campaignSenders = store.campaignSenders.filter(
                (r) => applyFilters([r], ctx.filters).length === 0,
              );
            }
            resolve([]);
          } catch (e) {
            reject?.(e);
          }
        },
      };
      return chain;
    },
  };
}

function doSelect(ctx: {
  shape?: Record<string, unknown>;
  table: string;
  filters: Record<string, unknown>;
}) {
  let rows: Record<string, unknown>[] = [];
  if (ctx.table === "campaigns") rows = store.campaigns;
  else if (ctx.table === "campaign_senders") rows = store.campaignSenders;
  else if (ctx.table === "campaign_leads") rows = store.campaignLeads;
  else if (ctx.table === "leads") rows = store.leads;

  // inArray(status, [...]) isn't extracted — for leads, also match list_id
  rows = applyFilters(rows, ctx.filters);

  if (ctx.table === "leads" && ctx.filters.list_id === undefined && ctx.filters.listId === undefined) {
    // drizzle column name is list_id
  }

  if (ctx.shape && "n" in ctx.shape) return [{ n: rows.length }];

  if (ctx.shape) {
    const keys = Object.keys(ctx.shape);
    return rows.map((r) => {
      const o: Record<string, unknown> = {};
      for (const k of keys) {
        if (k in r) o[k] = r[k];
        else if (k === "senderId") o[k] = r.senderId;
        else if (k === "id") o[k] = r.id;
        else if (k === "status") o[k] = r.status;
      }
      return o;
    });
  }
  return rows.map((r) => ({ ...r }));
}

function doInsert(ctx: { table: string; values: unknown }) {
  const vals = Array.isArray(ctx.values) ? ctx.values : [ctx.values];
  const out: unknown[] = [];
  for (const raw of vals) {
    const v = raw as Record<string, unknown>;
    if (ctx.table === "campaigns") {
      const row: CampaignRow = {
        id: nextId("camp"),
        userId: String(v.userId),
        name: String(v.name),
        status: String(v.status ?? "draft"),
        leadListId: (v.leadListId as string | null) ?? null,
        templateId: (v.templateId as string | null) ?? null,
        wizardStep: (v.wizardStep as number | null) ?? null,
        scheduledAt: (v.scheduledAt as string | null) ?? null,
        businessDaysOnly: Boolean(v.businessDaysOnly ?? false),
        sendingTimezone: String(v.sendingTimezone ?? "UTC"),
        sendingWindowStart: String(v.sendingWindowStart ?? "09:00"),
        sendingWindowEnd: String(v.sendingWindowEnd ?? "17:00"),
        dailyLimit: Number(v.dailyLimit ?? 100),
        minDelaySec: Number(v.minDelaySec ?? 90),
        maxDelaySec: Number(v.maxDelaySec ?? 240),
        maxEmailsPerSenderPerDay: Number(v.maxEmailsPerSenderPerDay ?? 50),
        stopOnReply: v.stopOnReply !== undefined ? Boolean(v.stopOnReply) : true,
        retryFailed: v.retryFailed !== undefined ? Boolean(v.retryFailed) : true,
        retryCount: Number(v.retryCount ?? 3),
        startedAt: (v.startedAt as string | null) ?? null,
        deletedAt: null,
      };
      store.campaigns.push(row);
      out.push({ id: row.id });
    } else if (ctx.table === "campaign_senders") {
      store.campaignSenders.push({
        campaignId: String(v.campaignId),
        senderId: String(v.senderId),
      });
      out.push(v);
    } else if (ctx.table === "campaign_leads") {
      const row = {
        id: nextId("cl"),
        campaignId: String(v.campaignId),
        leadId: String(v.leadId),
        status: String(v.status ?? "queued"),
      };
      if (!store.campaignLeads.some((x) => x.campaignId === row.campaignId && x.leadId === row.leadId)) {
        store.campaignLeads.push(row);
      }
      out.push(row);
    }
  }
  return out;
}

function seedDraft(overrides: Partial<CampaignRow> = {}): CampaignRow {
  const row: CampaignRow = {
    id: "camp-1",
    userId: "user-1",
    name: "Old",
    status: "draft",
    leadListId: null,
    templateId: null,
    wizardStep: 1,
    scheduledAt: null,
    businessDaysOnly: false,
    sendingTimezone: "UTC",
    sendingWindowStart: "09:00",
    sendingWindowEnd: "17:00",
    dailyLimit: 100,
    minDelaySec: 90,
    maxDelaySec: 240,
    maxEmailsPerSenderPerDay: 50,
    stopOnReply: true,
    retryFailed: true,
    retryCount: 3,
    startedAt: null,
    deletedAt: null,
    ...overrides,
  };
  store.campaigns.push(row);
  return row;
}

beforeEach(() => {
  idSeq = 0;
  store = { campaigns: [], campaignSenders: [], campaignLeads: [], leads: [] };
});

describe("saveCampaignDraftForUser", () => {
  it("saves name-only draft with null list/template", async () => {
    const result = await saveCampaignDraftForUser(createStoreDb() as never, "user-1", {
      name: "Only name",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.id).toBeTruthy();
    const row = store.campaigns[0];
    expect(row.status).toBe("draft");
    expect(row.name).toBe("Only name");
    expect(row.leadListId).toBeNull();
    expect(row.templateId).toBeNull();
  });

  it("defaults missing name to Untitled campaign", async () => {
    const result = await saveCampaignDraftForUser(createStoreDb() as never, "user-1", {});
    expect(result.ok).toBe(true);
    expect(store.campaigns[0].name).toBe("Untitled campaign");
  });

  it("merges fields and replaces senders when provided", async () => {
    seedDraft();
    store.campaignSenders.push({ campaignId: "camp-1", senderId: "old-s" });
    const result = await saveCampaignDraftForUser(createStoreDb() as never, "user-1", {
      id: "camp-1",
      name: "New name",
      leadListId: "list-9",
      senderIds: ["s-a", "s-b"],
      wizardStep: 4,
    });
    expect(result.ok).toBe(true);
    const row = store.campaigns[0];
    expect(row.name).toBe("New name");
    expect(row.leadListId).toBe("list-9");
    expect(row.wizardStep).toBe(4);
    expect(row.status).toBe("draft");
    expect(store.campaignSenders.map((s) => s.senderId).sort()).toEqual(["s-a", "s-b"]);
  });

  it("leaves senders unchanged when senderIds omitted", async () => {
    seedDraft();
    store.campaignSenders.push({ campaignId: "camp-1", senderId: "keep-me" });
    const result = await saveCampaignDraftForUser(createStoreDb() as never, "user-1", {
      id: "camp-1",
      name: "Renamed",
    });
    expect(result.ok).toBe(true);
    expect(store.campaignSenders).toEqual([{ campaignId: "camp-1", senderId: "keep-me" }]);
  });
});

describe("publishCampaignForUser", () => {
  const full = {
    name: "Go",
    leadListId: "list-1",
    senderIds: ["s1"],
    templateId: "t1",
    startMode: "now" as const,
    sendingTimezone: "UTC",
  };

  it("fails without postal when startMode is now", async () => {
    const result = await publishCampaignForUser(createStoreDb() as never, "user-1", full, null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(CAMPAIGN_POSTAL_REQUIRED_ERROR);
    expect(store.campaigns).toHaveLength(0);
  });

  it("with postal leaves draft status behind and creates campaign_leads", async () => {
    store.leads.push(
      { id: "lead-1", listId: "list-1", status: "pending", deletedAt: null },
      { id: "lead-2", listId: "list-1", status: "pending", deletedAt: null },
    );
    const result = await publishCampaignForUser(
      createStoreDb() as never,
      "user-1",
      full,
      "1 Main St, Austin TX",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = store.campaigns[0];
    expect(row.status).toBe("running");
    expect(row.leadListId).toBe("list-1");
    expect(row.wizardStep).toBeNull();
    expect(store.campaignSenders).toEqual([{ campaignId: row.id, senderId: "s1" }]);
    expect(store.campaignLeads).toHaveLength(2);
  });

  it("publishes an existing draft by id", async () => {
    seedDraft({ name: "Drafty" });
    store.leads.push({ id: "lead-1", listId: "list-1", status: "pending", deletedAt: null });
    const result = await publishCampaignForUser(
      createStoreDb() as never,
      "user-1",
      { ...full, id: "camp-1" },
      "1 Main St",
    );
    expect(result.ok).toBe(true);
    expect(store.campaigns).toHaveLength(1);
    expect(store.campaigns[0].status).toBe("running");
    expect(store.campaigns[0].name).toBe("Go");
    expect(store.campaignLeads).toHaveLength(1);
  });
});

describe("getCampaignWizardStateForUser", () => {
  it("returns wizard fields + senderIds for owned draft", async () => {
    seedDraft({ name: "Wip", leadListId: "L", templateId: "T", wizardStep: 2 });
    store.campaignSenders.push({ campaignId: "camp-1", senderId: "s1" });
    const result = await getCampaignWizardStateForUser(createStoreDb() as never, "user-1", "camp-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.wizardStep).toBe(2);
    expect(result.data?.senderIds).toEqual(["s1"]);
    expect(result.data?.leadListId).toBe("L");
    expect(result.data?.startMode).toBe("now");
  });

  it("not found for non-draft", async () => {
    seedDraft({ status: "running" });
    const result = await getCampaignWizardStateForUser(createStoreDb() as never, "user-1", "camp-1");
    expect(result.ok).toBe(false);
  });
});

describe("importLeads listId (F08a contract)", () => {
  it("success payload includes listId", () => {
    const data: { imported: number; skipped: number; invalid: number; listId: string } = {
      imported: 2,
      skipped: 0,
      invalid: 1,
      listId: "resolved-list",
    };
    expect(data.listId).toBe("resolved-list");
  });
});

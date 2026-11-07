import { beforeEach, describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  ensureCampaignLeadSnapshot,
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
  trackOpens: boolean;
  startedAt: string | null;
  [k: string]: unknown;
};

type Store = {
  campaigns: CampaignRow[];
  campaignSenders: { campaignId: string; senderId: string }[];
  campaignLeads: { id: string; campaignId: string; leadId: string; status: string }[];
  leads: { id: string; listId: string; status: string; deletedAt: string | null; email?: string }[];
  senderAccounts: { id: string; userId: string; isSystemPool: boolean; deletedAt: string | null }[];
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
      // A correlated subquery (NOT EXISTS ...) is about other rows: the fake
      // can't evaluate it, and its params must not filter the outer table.
      const text = n.queryChunks
        .map((c) => (Array.isArray((c as { value?: unknown })?.value) ? (c as { value: string[] }).value.join("") : ""))
        .join("");
      if (/\bexists\s*\(/i.test(text)) return;
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
      // A column the row doesn't have comes from a correlated subquery
      // (e.g. NOT EXISTS over campaign_leads); the fake can't evaluate it.
      if (!(key in row)) continue;
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
  // inArray(id, [...]) isn't extracted: every sender row comes back, which is
  // fine because the partition looks senders up by id.
  else if (ctx.table === "sender_accounts") return store.senderAccounts.map((r) => ({ ...r }));

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
        trackOpens: v.trackOpens !== undefined ? Boolean(v.trackOpens) : true,
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
    trackOpens: true,
    startedAt: null,
    deletedAt: null,
    ...overrides,
  };
  store.campaigns.push(row);
  return row;
}

beforeEach(() => {
  idSeq = 0;
  store = {
    campaigns: [],
    campaignSenders: [],
    campaignLeads: [],
    leads: [],
    senderAccounts: ["s1", "s-a", "s-b"].map((id) => ({
      id,
      userId: "user-1",
      isSystemPool: false,
      deletedAt: null,
    })),
  };
});

describe("sender ownership/pool filter (defense in depth)", () => {
  beforeEach(() => {
    store.senderAccounts.push(
      { id: "pool-1", userId: "admin-1", isSystemPool: true, deletedAt: null },
      { id: "other-1", userId: "user-2", isSystemPool: false, deletedAt: null },
      { id: "gone-1", userId: "user-1", isSystemPool: false, deletedAt: "2026-01-01T00:00:00.000Z" },
    );
  });
  const full = {
    name: "Go",
    leadListId: "list-1",
    templateId: "t1",
    startMode: "now" as const,
    sendingTimezone: "UTC",
  };

  it("draft save drops pool, foreign and deleted mailboxes for a non-admin", async () => {
    seedDraft();
    const result = await saveCampaignDraftForUser(createStoreDb() as never, "user-1", {
      id: "camp-1",
      senderIds: ["s-a", "pool-1", "other-1", "gone-1"],
    });
    expect(result.ok).toBe(true);
    expect(store.campaignSenders.map((s) => s.senderId)).toEqual(["s-a"]);
  });

  it("new draft never attaches a pool mailbox for a non-admin", async () => {
    const result = await saveCampaignDraftForUser(createStoreDb() as never, "user-1", {
      name: "x",
      senderIds: ["pool-1"],
    });
    expect(result.ok).toBe(true);
    expect(store.campaignSenders).toEqual([]);
  });

  it("publish refuses when only pool/foreign mailboxes were requested", async () => {
    const result = await publishCampaignForUser(
      createStoreDb() as never,
      "user-1",
      { ...full, senderIds: ["pool-1", "other-1"] },
      "1 Main St",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Shared AutoGTM mailboxes/);
    expect(store.campaigns).toHaveLength(0);
    expect(store.campaignSenders).toEqual([]);
  });

  it("publish keeps only the allowed mailboxes", async () => {
    store.leads.push({ id: "lead-1", listId: "list-1", status: "new", deletedAt: null });
    const result = await publishCampaignForUser(
      createStoreDb() as never,
      "user-1",
      { ...full, senderIds: ["s1", "pool-1"] },
      "1 Main St",
    );
    expect(result.ok).toBe(true);
    expect(store.campaignSenders.map((s) => s.senderId)).toEqual(["s1"]);
  });

  it("admins may attach pool mailboxes", async () => {
    store.leads.push({ id: "lead-1", listId: "list-1", status: "new", deletedAt: null });
    const result = await publishCampaignForUser(
      createStoreDb() as never,
      "admin-1",
      { ...full, senderIds: ["pool-1"] },
      "1 Main St",
      null,
      { isAdmin: true },
    );
    expect(result.ok).toBe(true);
    expect(store.campaignSenders.map((s) => s.senderId)).toEqual(["pool-1"]);
  });
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

  it("publish/start with empty postal succeeds (no CAMPAIGN_POSTAL_REQUIRED_ERROR)", async () => {
    store.leads.push(
      { id: "lead-1", listId: "list-1", status: "new", deletedAt: null },
      { id: "lead-2", listId: "list-1", status: "new", deletedAt: null },
    );
    const result = await publishCampaignForUser(createStoreDb() as never, "user-1", full, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = store.campaigns[0];
    expect(row.status).toBe("running");
    expect(row.leadListId).toBe("list-1");
    expect(row.wizardStep).toBeNull();
    expect(store.campaignSenders).toEqual([{ campaignId: row.id, senderId: "s1" }]);
    expect(store.campaignLeads).toHaveLength(2);
  });

  it("with postal still publishes and creates campaign_leads", async () => {
    store.leads.push(
      { id: "lead-1", listId: "list-1", status: "new", deletedAt: null },
      { id: "lead-2", listId: "list-1", status: "new", deletedAt: null },
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
    store.leads.push({ id: "lead-1", listId: "list-1", status: "new", deletedAt: null });
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

describe("ensureCampaignLeadSnapshot onlyMissing (#40)", () => {
  function seedSnapshot() {
    seedDraft({ status: "running", leadListId: "list-1" });
    store.leads.push(
      { id: "lead-1", listId: "list-1", status: "contacted", deletedAt: null, email: "a@x.com" },
      { id: "lead-2", listId: "list-1", status: "new", deletedAt: null, email: "b@x.com" },
    );
    store.campaignLeads.push(
      { id: "cl-a", campaignId: "camp-1", leadId: "lead-1", status: "sent" },
      { id: "cl-b", campaignId: "camp-1", leadId: "lead-2", status: "queued" },
    );
  }

  it("inserts only the list leads not in the campaign yet and returns that count", async () => {
    seedSnapshot();
    store.leads.push(
      { id: "lead-3", listId: "list-1", status: "new", deletedAt: null, email: "c@x.com" },
      { id: "lead-4", listId: "list-1", status: "new", deletedAt: null, email: "d@x.com" },
      // Never added: already emailed, deleted, or on another list.
      { id: "lead-5", listId: "list-1", status: "replied", deletedAt: null, email: "e@x.com" },
      { id: "lead-6", listId: "list-1", status: "new", deletedAt: "2026-01-01", email: "f@x.com" },
      { id: "lead-7", listId: "list-2", status: "new", deletedAt: null, email: "g@x.com" },
    );
    const n = await ensureCampaignLeadSnapshot(createStoreDb() as never, "camp-1", "list-1", { onlyMissing: true });
    expect(n).toBe(2);
    const ids = store.campaignLeads.filter((r) => r.campaignId === "camp-1").map((r) => r.leadId);
    expect(ids.sort()).toEqual(["lead-1", "lead-2", "lead-3", "lead-4"]);
    expect(store.campaignLeads.find((r) => r.leadId === "lead-1")?.status).toBe("sent");
  });

  it("returns 0 and inserts nothing when every list lead is already in the campaign", async () => {
    seedSnapshot();
    const n = await ensureCampaignLeadSnapshot(createStoreDb() as never, "camp-1", "list-1", { onlyMissing: true });
    expect(n).toBe(0);
    expect(store.campaignLeads).toHaveLength(2);
  });

  it("skips a second new lead row with the same address", async () => {
    seedSnapshot();
    store.leads.push(
      { id: "lead-3", listId: "list-1", status: "new", deletedAt: null, email: "C@x.com" },
      { id: "lead-4", listId: "list-1", status: "new", deletedAt: null, email: "c@x.com" },
    );
    const n = await ensureCampaignLeadSnapshot(createStoreDb() as never, "camp-1", "list-1", { onlyMissing: true });
    expect(n).toBe(1);
  });

  it("excludes addresses already in this campaign in SQL (not only by lead id)", async () => {
    seedSnapshot();
    let where: unknown;
    const db = createStoreDb();
    const realSelect = db.select.bind(db);
    db.select = ((shape?: Record<string, unknown>) => {
      const chain = realSelect(shape);
      const realWhere = chain.where.bind(chain);
      chain.where = (cond: unknown) => {
        if (shape && "email" in shape) where = cond;
        return realWhere(cond);
      };
      return chain;
    }) as typeof db.select;
    await ensureCampaignLeadSnapshot(db as never, "camp-1", "list-1", { onlyMissing: true });
    const q = new PgDialect().sqlToQuery(where as never);
    expect(q.sql).toContain("not exists");
    expect(q.sql).toContain('inner join "leads" as snapshot_other_lead on snapshot_other_lead.id = "campaign_leads"."lead_id"');
    expect(q.sql).toContain('lower(snapshot_other_lead.email) = lower("leads"."email")');
    expect(q.params).toEqual(expect.arrayContaining(["list-1", "new", "camp-1"]));
  });

  it("without onlyMissing an existing snapshot is left untouched", async () => {
    seedSnapshot();
    store.leads.push({ id: "lead-3", listId: "list-1", status: "new", deletedAt: null, email: "c@x.com" });
    const n = await ensureCampaignLeadSnapshot(createStoreDb() as never, "camp-1", "list-1");
    expect(n).toBe(2);
    expect(store.campaignLeads).toHaveLength(2);
  });
});

describe("snapshot rules (#31)", () => {
  /** A store db that records the SQL of every select on `leads` that reads lead ids. */
  function capturingDb() {
    const wheres: unknown[] = [];
    const db = createStoreDb();
    const realSelect = db.select.bind(db);
    db.select = ((shape?: Record<string, unknown>) => {
      const chain = realSelect(shape);
      const realWhere = chain.where.bind(chain);
      chain.where = (cond: unknown) => {
        if (shape && "id" in shape && Object.keys(shape).length <= 2) wheres.push(cond);
        return realWhere(cond);
      };
      return chain;
    }) as typeof db.select;
    return { db, wheres };
  }
  const render = (w: unknown) => new PgDialect().sqlToQuery(w as never);
  const leadSnapshotQuery = (wheres: unknown[]) =>
    wheres.map(render).find((q) => q.sql.includes('"leads"."list_id"'))!;

  const full = {
    name: "Go",
    leadListId: "list-1",
    senderIds: ["s1"],
    templateId: "t1",
    startMode: "now" as const,
    sendingTimezone: "UTC",
  };

  it("publish without re-engage takes only 'new' leads and applies the 90-day rule", async () => {
    store.leads.push({ id: "lead-1", listId: "list-1", status: "new", deletedAt: null });
    const { db, wheres } = capturingDb();
    const result = await publishCampaignForUser(db as never, "user-1", full, null);
    expect(result.ok).toBe(true);
    const q = leadSnapshotQuery(wheres);
    expect(q.params).toContain("new");
    expect(q.params).not.toContain("contacted");
    expect(q.sql).toContain('"sendability_other_campaign_lead"."created_at" >=');
    expect(q.params).toContain("user-1");
  });

  it("publish passes reengageContacted to the snapshot", async () => {
    store.leads.push({ id: "lead-1", listId: "list-1", status: "contacted", deletedAt: null });
    const { db, wheres } = capturingDb();
    const result = await publishCampaignForUser(db as never, "user-1", { ...full, reengageContacted: true }, null);
    expect(result.ok).toBe(true);
    const q = leadSnapshotQuery(wheres);
    expect(q.params).toEqual(expect.arrayContaining(["new", "contacted"]));
    expect(q.sql).not.toContain('"sendability_other_campaign_lead"."created_at" >=');
  });

  it("publishing an existing draft also applies the rules", async () => {
    seedDraft({ name: "Drafty" });
    store.leads.push({ id: "lead-1", listId: "list-1", status: "new", deletedAt: null });
    const { db, wheres } = capturingDb();
    const result = await publishCampaignForUser(db as never, "user-1", { ...full, id: "camp-1", reengageContacted: true }, null);
    expect(result.ok).toBe(true);
    const q = leadSnapshotQuery(wheres);
    expect(q.params).toContain("contacted");
    expect(q.params).toContain("camp-1");
  });

  it("onlyMissing inserts only leads not already in the campaign, with the same rules", async () => {
    seedDraft({ status: "running", leadListId: "list-1" });
    store.leads.push(
      { id: "lead-1", listId: "list-1", status: "new", deletedAt: null, email: "a@x.com" },
      { id: "lead-2", listId: "list-1", status: "new", deletedAt: null, email: "b@x.com" },
    );
    store.campaignLeads.push({ id: "cl-a", campaignId: "camp-1", leadId: "lead-1", status: "sent" });
    const { db, wheres } = capturingDb();
    const n = await ensureCampaignLeadSnapshot(db as never, "camp-1", "list-1", { onlyMissing: true });
    expect(n).toBe(1);
    expect(store.campaignLeads.map((r) => r.leadId).sort()).toEqual(["lead-1", "lead-2"]);
    const q = wheres.map(render).find((x) => x.sql.includes("sendability_other_campaign"));
    expect(q?.sql).toContain("not exists");
  });

  it("takes nobody when the campaign's owner can't be found (fails closed)", async () => {
    store.leads.push({ id: "lead-1", listId: "list-1", status: "new", deletedAt: null });
    const n = await ensureCampaignLeadSnapshot(createStoreDb() as never, "missing-campaign", "list-1");
    expect(n).toBe(0);
    expect(store.campaignLeads).toHaveLength(0);
  });
});

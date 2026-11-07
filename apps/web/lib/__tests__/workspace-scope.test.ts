import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { schema } from "@smartreach/database";

/* #75: the workspace switcher scopes every list and count the same way.
 * Rows with no workspace belong to the default workspace (wsCondition), and
 * replies follow the Inbox rule (campaign or mailbox in the workspace). */

const state = vi.hoisted(() => ({
  workspace: { id: "w2", isDefault: false } as { id: string; isDefault: boolean },
  calls: [] as Array<{ table: unknown; where?: any; joins: unknown[] }>,
  writes: [] as Array<{ op: "insert" | "update" | "delete"; table: unknown; set?: any; values?: any; where?: any }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../session", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "c@example.com", role: "user" })) }));
vi.mock("../workspaces", () => ({
  getActiveWorkspace: vi.fn(async () => state.workspace),
  ensureDefaultWorkspace: vi.fn(async () => ({ id: "w1", isDefault: true })),
}));
vi.mock("../chad-gtm-actions", () => ({ analyzeWebsiteAction: vi.fn() }));
vi.mock("../gtm-launch", () => ({
  COMPLIANCE_REQUIRED_ERROR: "compliance",
  LaunchError: class extends Error {},
  LaunchInProgressError: class extends Error {},
  launchRunCampaign: vi.fn(),
  loadComplianceIdentity: vi.fn(),
}));
vi.mock("../ai", () => ({ getWorkspaceAiOptions: vi.fn() }));
vi.mock("../approval", () => ({ APPROVAL_REQUIRED_ERROR: "approval required", assertCanSend: vi.fn() }));
vi.mock("@smartreach/email-engine/reply-agent", () => ({ sendAgentReply: vi.fn() }));
vi.mock("@smartreach/email-engine", () => ({ extractSenderFirstName: () => "Alex", callLlmJson: async () => null }));
vi.mock("../db", () => {
  const chain = (entry: { table: unknown; where?: any; joins: unknown[] }) => {
    const c: any = {
      from: (t: unknown) => ((entry.table = t), c),
      where: (w: any) => ((entry.where = w), c),
      innerJoin: (t: unknown) => (entry.joins.push(t), c),
      leftJoin: (t: unknown) => (entry.joins.push(t), c),
      orderBy: () => c,
      groupBy: () => c,
      limit: () => c,
      then: (resolve: any, reject: any) => Promise.resolve([]).then(resolve, reject),
    };
    return c;
  };
  const write = (op: "insert" | "update" | "delete") => (table: unknown) => {
    const entry: (typeof state.writes)[number] = { op, table };
    state.writes.push(entry);
    const c: any = {
      set: (v: any) => ((entry.set = v), c),
      values: (v: any) => ((entry.values = v), c),
      where: (w: any) => ((entry.where = w), c),
      returning: () => c,
      then: (resolve: any, reject: any) => Promise.resolve([{ id: "k1" }]).then(resolve, reject),
    };
    return c;
  };
  const db = {
    select: () => {
      const entry = { table: undefined as unknown, where: undefined as any, joins: [] as unknown[] };
      state.calls.push(entry);
      return chain(entry);
    },
    insert: write("insert"),
    update: write("update"),
    delete: write("delete"),
  };
  return { getDb: () => db, ensureChadGtmTables: async () => undefined };
});

import { activityWorkspaceCondition, getRecentActivity, replyWorkspaceCondition } from "../queries";
import {
  countKnowledgeAction,
  countOpenAgentRequests,
  listAgentRequests,
  listKnowledge,
  saveKnowledgeAction,
} from "../autopilot-actions";

const dialect = new PgDialect();
const render = (s: any) => dialect.sqlToQuery(s);

beforeEach(() => {
  state.calls = [];
  state.writes = [];
  state.workspace = { id: "w2", isDefault: false };
});

describe("replyWorkspaceCondition (the Inbox rule)", () => {
  it("default workspace: its campaigns or mailboxes, plus replies with neither", () => {
    const q = render(replyWorkspaceCondition("w1", true));
    expect(q.sql).toContain('"campaigns"."workspace_id" = $1');
    expect(q.sql).toContain('"sender_accounts"."workspace_id" = $2');
    expect(q.sql).toContain('("campaigns"."workspace_id" IS NULL AND "sender_accounts"."workspace_id" IS NULL)');
    expect(q.params).toEqual(["w1", "w1"]);
  });

  it("other workspaces: strict, no NULL rows", () => {
    const q = render(replyWorkspaceCondition("w2", false));
    expect(q.sql).not.toContain("IS NULL");
    expect(q.params).toEqual(["w2", "w2"]);
  });
});

describe("getRecentActivity", () => {
  it("default workspace: account events, deleted campaigns and campaigns without a workspace show", () => {
    const q = render(activityWorkspaceCondition("w1", true));
    expect(q.sql).toContain('"activity_logs"."campaign_id" IS NULL');
    expect(q.sql).toContain('"campaigns"."id" IS NULL');
    expect(q.sql).toContain('("campaigns"."workspace_id" = $1 OR "campaigns"."workspace_id" IS NULL)');
  });

  it("other workspaces: only their campaigns' events (plus account events)", () => {
    const q = render(activityWorkspaceCondition("w2", false));
    expect(q.sql).toContain('"campaigns"."workspace_id" = $1');
    expect(q.sql).not.toContain('"campaigns"."workspace_id" IS NULL');
    expect(q.params).toEqual(["w2"]);
  });

  it("joins campaigns and filters by workspace when one is given", async () => {
    await getRecentActivity("u1", 20, { workspaceId: "w2", isDefault: false });
    const call = state.calls.at(-1)!;
    expect(call.table).toBe(schema.activityLogs);
    expect(call.joins).toContain(schema.campaigns);
    const q = render(call.where);
    expect(q.sql).toContain('"campaigns"."workspace_id" = $');
    expect(q.params).toContain("w2");
  });

  it("without a workspace keeps the account-wide feed", async () => {
    await getRecentActivity("u1", 20);
    const call = state.calls.at(-1)!;
    expect(call.joins).toEqual([]);
    expect(render(call.where).sql).not.toContain("workspace_id");
  });
});

describe("Needs you and the knowledge base follow the active workspace", () => {
  it("countOpenAgentRequests filters agent_requests by the active workspace", async () => {
    await countOpenAgentRequests();
    const call = state.calls.find((c) => c.table === schema.agentRequests)!;
    const q = render(call.where);
    expect(q.sql).toContain('"agent_requests"."workspace_id"');
    expect(q.params).toContain("w2");
    expect(q.sql).not.toContain('"agent_requests"."workspace_id" IS NULL');
  });

  it("the default workspace also counts requests with no workspace", async () => {
    state.workspace = { id: "w1", isDefault: true };
    await countOpenAgentRequests();
    const call = state.calls.find((c) => c.table === schema.agentRequests)!;
    expect(render(call.where).sql).toContain('"agent_requests"."workspace_id" IS NULL');
  });

  it("listKnowledge filters agent_knowledge by the active workspace", async () => {
    await listKnowledge();
    const call = state.calls.find((c) => c.table === schema.agentKnowledge)!;
    const q = render(call.where);
    expect(q.sql).toContain('"agent_knowledge"."workspace_id"');
    expect(q.params).toContain("w2");
  });
});

/* requestScope / knowledgeScope: every Needs you and knowledge read or edit uses the same rule. */
describe("requestScope: the Needs you list", () => {
  it("listAgentRequests filters by owner and the active workspace, strict outside the default", async () => {
    await listAgentRequests("open");
    const call = state.calls.find((c) => c.table === schema.agentRequests)!;
    const q = render(call.where);
    expect(q.sql).toContain('"agent_requests"."user_id" = $');
    expect(q.sql).toContain('"agent_requests"."workspace_id" = $');
    expect(q.sql).not.toContain('"agent_requests"."workspace_id" IS NULL');
    expect(q.params).toEqual(expect.arrayContaining(["u1", "w2"]));
  });

  it("the default workspace's list also shows cards with no workspace", async () => {
    state.workspace = { id: "w1", isDefault: true };
    await listAgentRequests("all");
    const call = state.calls.find((c) => c.table === schema.agentRequests)!;
    expect(render(call.where).sql).toContain('"agent_requests"."workspace_id" IS NULL');
  });
});

describe("knowledgeScope: the knowledge base", () => {
  it("countKnowledgeAction counts only the owner's items in the active workspace", async () => {
    await countKnowledgeAction();
    const call = state.calls.find((c) => c.table === schema.agentKnowledge)!;
    const q = render(call.where);
    expect(q.sql).toContain('"agent_knowledge"."user_id" = $');
    expect(q.sql).not.toContain('"agent_knowledge"."workspace_id" IS NULL');
    expect(q.params).toEqual(expect.arrayContaining(["u1", "w2"]));
  });

  it("a new item is filed in the active workspace", async () => {
    const r = await saveKnowledgeAction({ kind: "fact", title: "Pricing", content: "From $99 a month." });
    expect(r.ok).toBe(true);
    const insert = state.writes.find((w) => w.op === "insert" && w.table === schema.agentKnowledge);
    expect(insert?.values).toMatchObject({ userId: "u1", workspaceId: "w2" });
  });

  it("an edit only matches items of the active workspace", async () => {
    await saveKnowledgeAction({ id: "k1", kind: "fact", title: "Pricing", content: "From $99 a month." });
    const update = state.writes.find((w) => w.op === "update" && w.table === schema.agentKnowledge)!;
    const q = render(update.where);
    expect(q.sql).toContain('"agent_knowledge"."id" = $');
    expect(q.sql).toContain('"agent_knowledge"."workspace_id" = $');
    expect(q.params).toEqual(expect.arrayContaining(["k1", "u1", "w2"]));
  });
});

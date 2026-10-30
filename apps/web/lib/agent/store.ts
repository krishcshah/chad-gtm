import { and, asc, desc, eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { ensureAgentTables } from "../db";
import type {
  AgentRunRecord,
  AgentStepRecord,
  AgentStore,
  StartAgentRunInput,
} from "./types";

function mapRun(row: any): AgentRunRecord {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId ?? null,
    kind: row.kind,
    goal: row.goal,
    status: row.status,
    phase: row.phase,
    input: row.input ?? {},
    state: row.state ?? {},
    error: row.error ?? null,
    budgetCents: row.budgetCents ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapStep(row: any): AgentStepRecord {
  return {
    id: row.id,
    runId: row.runId,
    seq: row.seq,
    agent: row.agent,
    tool: row.tool ?? null,
    status: row.status,
    input: row.input ?? {},
    output: row.output ?? {},
    error: row.error ?? null,
    latencyMs: row.latencyMs ?? null,
    tokens: row.tokens ?? null,
    costMicros: row.costMicros ?? null,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt ?? null,
    createdAt: row.createdAt,
  };
}

export class DrizzleAgentStore implements AgentStore {
  constructor(private readonly db: any) {}

  async createRun(input: StartAgentRunInput): Promise<AgentRunRecord> {
    await ensureAgentTables(this.db);
    const now = new Date().toISOString();
    const [row] = await this.db
      .insert(schema.agentRuns)
      .values({
        id: crypto.randomUUID(),
        userId: input.userId,
        workspaceId: input.workspaceId,
        kind: input.kind,
        goal: input.goal,
        status: "running",
        phase: "intake",
        input: input.input ?? {},
        state: input.state ?? {},
        budgetCents: input.budgetCents ?? null,
        startedAt: now,
        updatedAt: now,
      })
      .returning();
    return mapRun(row);
  }

  async getRun(id: string): Promise<AgentRunRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, id))
      .limit(1);
    return row ? mapRun(row) : null;
  }

  async updateRun(
    id: string,
    patch: Partial<
      Pick<
        AgentRunRecord,
        "status" | "phase" | "state" | "error" | "finishedAt" | "updatedAt"
      >
    >
  ): Promise<void> {
    await this.db
      .update(schema.agentRuns)
      .set({ ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() })
      .where(eq(schema.agentRuns.id, id));
  }

  async createStep(input: {
    runId: string;
    seq: number;
    agent: string;
    tool: string | null;
    input: Record<string, any>;
  }): Promise<AgentStepRecord> {
    const now = new Date().toISOString();
    const [row] = await this.db
      .insert(schema.agentSteps)
      .values({
        id: crypto.randomUUID(),
        runId: input.runId,
        seq: input.seq,
        agent: input.agent,
        tool: input.tool,
        status: "running",
        input: input.input ?? {},
        output: {},
        startedAt: now,
      })
      .returning();
    return mapStep(row);
  }

  async updateStep(
    id: string,
    patch: Partial<
      Pick<
        AgentStepRecord,
        "status" | "output" | "error" | "latencyMs" | "tokens" | "costMicros" | "finishedAt"
      >
    >
  ): Promise<void> {
    await this.db
      .update(schema.agentSteps)
      .set({
        ...patch,
        finishedAt: patch.finishedAt ?? new Date().toISOString(),
      })
      .where(eq(schema.agentSteps.id, id));
  }

  async listSteps(runId: string): Promise<AgentStepRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.agentSteps)
      .where(eq(schema.agentSteps.runId, runId))
      .orderBy(asc(schema.agentSteps.seq));
    return rows.map(mapStep);
  }

  async nextSeq(runId: string): Promise<number> {
    const [row] = await this.db
      .select({ maxSeq: sql<number>`coalesce(max(${schema.agentSteps.seq}), 0)` })
      .from(schema.agentSteps)
      .where(eq(schema.agentSteps.runId, runId));
    return Number(row?.maxSeq ?? 0) + 1;
  }

  async listRunsForUser(userId: string, limit = 50): Promise<AgentRunRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.userId, userId))
      .orderBy(desc(schema.agentRuns.createdAt))
      .limit(limit);
    return rows.map(mapRun);
  }

  async getRunForUser(id: string, userId: string): Promise<AgentRunRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.agentRuns)
      .where(and(eq(schema.agentRuns.id, id), eq(schema.agentRuns.userId, userId)))
      .limit(1);
    return row ? mapRun(row) : null;
  }
}

"use server";

import { and, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { requireUser } from "./session";
import { DrizzleAgentStore } from "./agent/store";
import { ToolRegistry } from "./agent/registry";
import { GtmAnalysisPlanner } from "./agent/planner";
import { AgentRuntime } from "./agent/runtime";
import { PHASE_1_TOOLS } from "./agent/tools";
import type { AgentRunRecord, AgentStepRecord } from "./agent/types";

function buildRegistry() {
  return new ToolRegistry().registerAll(PHASE_1_TOOLS);
}

function buildRuntime(db: any) {
  return new AgentRuntime({
    store: new DrizzleAgentStore(db),
    registry: buildRegistry(),
    planner: new GtmAnalysisPlanner(),
    db,
    maxSteps: 20,
  });
}

export interface AgentTracePayload {
  run: AgentRunRecord;
  steps: AgentStepRecord[];
  chadGtmRun: {
    id: string;
    companyName: string;
    url: string;
    status: string;
  };
}

export async function getAgentTraceAction(
  chadGtmRunId: string
): Promise<AgentTracePayload | null> {
  try {
    const user = await requireUser();
    const db = getDb();

    const [chadRun] = await db
      .select({
        id: schema.chadGtmRuns.id,
        companyName: schema.chadGtmRuns.companyName,
        url: schema.chadGtmRuns.url,
        status: schema.chadGtmRuns.status,
        agentRunId: schema.chadGtmRuns.agentRunId,
      })
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.id, chadGtmRunId),
          eq(schema.chadGtmRuns.userId, user.id)
        )
      )
      .limit(1);

    if (!chadRun?.agentRunId) return null;

    const store = new DrizzleAgentStore(db);
    const run = await store.getRunForUser(chadRun.agentRunId, user.id);
    if (!run) return null;

    const steps = await store.listSteps(run.id);
    return {
      run,
      steps,
      chadGtmRun: {
        id: chadRun.id,
        companyName: chadRun.companyName,
        url: chadRun.url,
        status: chadRun.status,
      },
    };
  } catch (err) {
    console.error("[agent-actions] getAgentTraceAction error:", err);
    return null;
  }
}

export async function retryAgentRunAction(
  agentRunId: string
): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    const store = new DrizzleAgentStore(db);
    const run = await store.getRunForUser(agentRunId, user.id);
    if (!run) return { ok: false, error: "Agent run not found." };

    const runtime = buildRuntime(db);
    await runtime.retry(agentRunId);
    const result = await runtime.runUntilPause(agentRunId);
    return { ok: result.run.status !== "failed", status: result.run.status };
  } catch (err: any) {
    console.error("[agent-actions] retryAgentRunAction error:", err);
    return { ok: false, error: err?.message || "Failed to retry agent run." };
  }
}

export async function resumeAgentRunAction(
  agentRunId: string
): Promise<{ ok: boolean; status?: string; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    const store = new DrizzleAgentStore(db);
    const run = await store.getRunForUser(agentRunId, user.id);
    if (!run) return { ok: false, error: "Agent run not found." };

    const runtime = buildRuntime(db);
    await runtime.resume(agentRunId);
    const result = await runtime.runUntilPause(agentRunId);
    return { ok: result.run.status !== "failed", status: result.run.status };
  } catch (err: any) {
    console.error("[agent-actions] resumeAgentRunAction error:", err);
    return { ok: false, error: err?.message || "Failed to resume agent run." };
  }
}

export async function cancelAgentRunAction(
  agentRunId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const db = getDb();
    const store = new DrizzleAgentStore(db);
    const run = await store.getRunForUser(agentRunId, user.id);
    if (!run) return { ok: false, error: "Agent run not found." };

    const runtime = buildRuntime(db);
    await runtime.cancel(agentRunId);
    return { ok: true };
  } catch (err: any) {
    console.error("[agent-actions] cancelAgentRunAction error:", err);
    return { ok: false, error: err?.message || "Failed to cancel agent run." };
  }
}

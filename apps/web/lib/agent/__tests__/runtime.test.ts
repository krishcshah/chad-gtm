import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../registry";
import { AgentRuntime } from "../runtime";
import { GtmAnalysisPlanner, ScriptedPlanner } from "../planner";
import type {
  AgentRunRecord,
  AgentStepRecord,
  AgentStore,
  StartAgentRunInput,
} from "../types";

class MemoryStore implements AgentStore {
  runs = new Map<string, AgentRunRecord>();
  steps = new Map<string, AgentStepRecord>();

  async createRun(input: StartAgentRunInput): Promise<AgentRunRecord> {
    const now = new Date().toISOString();
    const run: AgentRunRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      workspaceId: input.workspaceId,
      kind: input.kind,
      goal: input.goal,
      status: "running",
      phase: "intake",
      input: input.input ?? {},
      state: input.state ?? {},
      error: null,
      budgetCents: input.budgetCents ?? null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async getRun(id: string): Promise<AgentRunRecord | null> {
    return this.runs.get(id) ?? null;
  }

  async updateRun(
    id: string,
    patch: Partial<
      Pick<AgentRunRecord, "status" | "phase" | "state" | "error" | "finishedAt" | "updatedAt">
    >
  ): Promise<void> {
    const run = this.runs.get(id);
    if (!run) return;
    this.runs.set(id, { ...run, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() });
  }

  async createStep(input: {
    runId: string;
    seq: number;
    agent: string;
    tool: string | null;
    input: Record<string, any>;
  }): Promise<AgentStepRecord> {
    const now = new Date().toISOString();
    const step: AgentStepRecord = {
      id: crypto.randomUUID(),
      runId: input.runId,
      seq: input.seq,
      agent: input.agent,
      tool: input.tool,
      status: "running",
      input: input.input,
      output: {},
      error: null,
      latencyMs: null,
      tokens: null,
      costMicros: null,
      startedAt: now,
      finishedAt: null,
      createdAt: now,
    };
    this.steps.set(step.id, step);
    return step;
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
    const step = this.steps.get(id);
    if (!step) return;
    this.steps.set(id, { ...step, ...patch });
  }

  async listSteps(runId: string): Promise<AgentStepRecord[]> {
    return Array.from(this.steps.values())
      .filter((step) => step.runId === runId)
      .sort((a, b) => a.seq - b.seq);
  }

  async nextSeq(runId: string): Promise<number> {
    const seqs = Array.from(this.steps.values())
      .filter((step) => step.runId === runId)
      .map((step) => step.seq);
    return (seqs.length ? Math.max(...seqs) : 0) + 1;
  }
}

function fakeAnalysisRegistry(calls: string[] = []) {
  return new ToolRegistry().registerAll([
    {
      name: "crawl_company",
      description: "fake crawl",
      inputSchema: z.object({ url: z.string() }),
      outputSchema: z.object({
        url: z.string(),
        domain: z.string(),
        title: z.string(),
        description: z.string(),
        headings: z.array(z.string()),
        bodySnippets: z.array(z.string()),
        subpageSnippets: z.array(z.object({ path: z.string(), text: z.string() })),
        fetchFailed: z.boolean(),
      }),
      async run(input, ctx) {
        calls.push("crawl");
        return {
          url: input.url,
          domain: "acme.test",
          title: "Acme",
          description: "Acme automates work.",
          headings: ["Automate work"],
          bodySnippets: ["Acme saves teams time."],
          subpageSnippets: [],
          fetchFailed: false,
        };
      },
    },
    {
      name: "synthesize_strategy",
      description: "fake strategy",
      inputSchema: z.object({ notes: z.string().optional() }),
      outputSchema: z.object({
        companyName: z.string(),
        businessOverview: z.record(z.any()),
        icpProfile: z.record(z.any()),
        offers: z.array(z.record(z.any())),
        scrapedData: z.record(z.any()),
      }),
      async run(_input, ctx) {
        calls.push("synthesize");
        return {
          companyName: "Acme",
          businessOverview: { summary: "Automates work" },
          icpProfile: { industries: ["Software"] },
          offers: [{ title: "Faster work" }],
          scrapedData: ctx.state.scraped,
        };
      },
    },
    {
      name: "persist_gtm_run",
      description: "fake persist",
      inputSchema: z.object({ url: z.string(), notes: z.string().optional() }),
      outputSchema: z.object({ chadGtmRunId: z.string() }),
      async run() {
        calls.push("persist");
        return { chadGtmRunId: "chad-run-1" };
      },
    },
  ]);
}

describe("AgentRuntime", () => {
  it("runs a deterministic analysis plan to completion and persists state", async () => {
    const store = new MemoryStore();
    const calls: string[] = [];
    const runtime = new AgentRuntime({
      store,
      registry: fakeAnalysisRegistry(calls),
      planner: new GtmAnalysisPlanner(),
      db: {},
      now: () => new Date("2026-10-30T10:00:00Z"),
    });

    const run = await runtime.start({
      userId: "u1",
      workspaceId: "w1",
      kind: "gtm_analysis",
      goal: "https://acme.test",
      input: { url: "https://acme.test" },
    });

    const result = await runtime.runUntilPause(run.id);
    expect(result.run.status).toBe("completed");
    expect(result.stoppedBecause).toBe("complete");
    expect(calls).toEqual(["crawl", "synthesize", "persist"]);
    expect(result.run.state.persistence.chadGtmRunId).toBe("chad-run-1");
    expect(result.steps).toHaveLength(4);
    expect(result.steps.map((s) => s.seq)).toEqual([1, 2, 3, 4]);
  });

  it("pauses for approval and resumes", async () => {
    const store = new MemoryStore();
    const runtime = new AgentRuntime({
      store,
      registry: new ToolRegistry(),
      planner: new ScriptedPlanner([
        { type: "approval", phase: "strategy_review", reason: "Review the strategy" },
        { type: "complete", phase: "complete", summary: "Done" },
      ]),
      db: {},
    });

    const run = await runtime.start({
      userId: "u1",
      workspaceId: "w1",
      kind: "gtm_analysis",
      goal: "goal",
    });

    const paused = await runtime.runUntilPause(run.id);
    expect(paused.run.status).toBe("waiting_approval");
    expect(paused.stoppedBecause).toBe("approval");

    await runtime.resume(run.id);
    const resumed = await runtime.runUntilPause(run.id);
    expect(resumed.run.status).toBe("completed");
  });

  it("marks a failed tool and retries from state without repeating successful work", async () => {
    const store = new MemoryStore();
    let attempts = 0;
    const registry = new ToolRegistry().registerAll([
      {
        name: "crawl_company",
        description: "flaky crawl",
        inputSchema: z.object({ url: z.string() }),
        outputSchema: z.object({ ok: z.boolean() }),
        async run() {
          attempts++;
          if (attempts === 1) throw new Error("network down");
          return { ok: true };
        },
      },
    ]);
    const planner = {
      next(run: AgentRunRecord) {
        if (!run.state.scraped) {
          return {
            type: "tool" as const,
            tool: "crawl_company",
            input: { url: "https://acme.test" },
            stateKey: "scraped",
            nextPhase: "research" as const,
          };
        }
        return { type: "complete" as const, phase: "complete" as const };
      },
    };
    const runtime = new AgentRuntime({ store, registry, planner, db: {} });

    const run = await runtime.start({
      userId: "u1",
      workspaceId: null,
      kind: "gtm_analysis",
      goal: "goal",
      input: { url: "https://acme.test" },
    });

    const failed = await runtime.runUntilPause(run.id);
    expect(failed.run.status).toBe("failed");
    expect(attempts).toBe(1);

    await runtime.retry(run.id);
    const retried = await runtime.runUntilPause(run.id);
    expect(retried.run.status).toBe("completed");
    expect(attempts).toBe(2);
    expect(retried.run.state.scraped).toEqual({ ok: true });
  });
});

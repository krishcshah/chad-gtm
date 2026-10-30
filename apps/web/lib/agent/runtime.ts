import type {
  AgentLogger,
  AgentPhase,
  AgentRunRecord,
  AgentRuntimeOptions,
  AgentStepRecord,
  AgentStore,
  Planner,
  PlannerDecision,
  RunUntilPauseResult,
  StartAgentRunInput,
} from "./types";
import type { ToolRegistry } from "./registry";

const defaultLogger: AgentLogger = {
  info: (message, meta) => console.log(`[agent] ${message}`, meta ?? ""),
  warn: (message, meta) => console.warn(`[agent] ${message}`, meta ?? ""),
  error: (message, meta) => console.error(`[agent] ${message}`, meta ?? ""),
};

function toRecord(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  return { value };
}

/**
 * Durable agent runtime.
 *
 * The runtime is deliberately smaller than a general-purpose agent framework:
 * a planner chooses one decision at a time, the registry executes typed tools,
 * and every transition is persisted. This is enough to build research, copy,
 * prospecting, and reply loops without giving an LLM control of the sender.
 */
export class AgentRuntime {
  private readonly store: AgentStore;
  private readonly registry: ToolRegistry;
  private readonly planner: Planner;
  private readonly db: any;
  private readonly maxSteps: number;
  private readonly now: () => Date;
  private readonly logger: AgentLogger;

  constructor(options: AgentRuntimeOptions) {
    this.store = options.store;
    this.registry = options.registry;
    this.planner = options.planner;
    this.db = options.db;
    this.maxSteps = options.maxSteps ?? 20;
    this.now = options.now ?? (() => new Date());
    this.logger = options.logger ?? defaultLogger;
  }

  async start(input: StartAgentRunInput): Promise<AgentRunRecord> {
    const run = await this.store.createRun(input);
    this.logger.info("run started", { runId: run.id, kind: run.kind, goal: run.goal });
    return run;
  }

  async getRun(runId: string): Promise<AgentRunRecord | null> {
    return this.store.getRun(runId);
  }

  async listSteps(runId: string): Promise<AgentStepRecord[]> {
    return this.store.listSteps(runId);
  }

  /**
   * Execute exactly one planner decision. Use `runUntilPause` for the full loop.
   */
  async advance(runId: string): Promise<AgentRunRecord | null> {
    const run = await this.store.getRun(runId);
    if (!run || run.status !== "running") return run ?? null;

    let decision: PlannerDecision;
    try {
      decision = await this.planner.next(run);
    } catch (err: any) {
      const message = err?.message || "Planner failed";
      await this.store.updateRun(runId, {
        status: "failed",
        phase: "failed",
        error: message,
        finishedAt: this.now().toISOString(),
      });
      return this.store.getRun(runId);
    }

    if (decision.type === "complete") {
      await this.recordControlStep(run, {
        status: "succeeded",
        output: { decision: "complete", summary: decision.summary ?? "" },
      });
      await this.store.updateRun(runId, {
        status: "completed",
        phase: decision.phase ?? "complete",
        finishedAt: this.now().toISOString(),
        error: null,
      });
      this.logger.info("run completed", { runId });
      return this.store.getRun(runId);
    }

    if (decision.type === "approval") {
      await this.recordControlStep(run, {
        status: "succeeded",
        output: { decision: "approval", phase: decision.phase, reason: decision.reason },
      });
      await this.store.updateRun(runId, {
        status: "waiting_approval",
        phase: decision.phase,
      });
      this.logger.info("run waiting for approval", { runId, phase: decision.phase });
      return this.store.getRun(runId);
    }

    if (decision.type === "fail") {
      await this.recordControlStep(run, {
        status: "failed",
        error: decision.error,
        output: { decision: "fail" },
      });
      await this.store.updateRun(runId, {
        status: "failed",
        phase: "failed",
        error: decision.error,
        finishedAt: this.now().toISOString(),
      });
      return this.store.getRun(runId);
    }

    const tool = this.registry.get(decision.tool);
    if (!tool) {
      const error = `Unknown tool: ${decision.tool}`;
      await this.recordControlStep(run, {
        status: "failed",
        error,
        output: { decision: "tool", tool: decision.tool },
      });
      await this.store.updateRun(runId, {
        status: "failed",
        phase: "failed",
        error,
        finishedAt: this.now().toISOString(),
      });
      return this.store.getRun(runId);
    }

    const seq = await this.store.nextSeq(runId);
    const step = await this.store.createStep({
      runId,
      seq,
      agent: decision.agent ?? "orchestrator",
      tool: decision.tool,
      input: decision.input ?? {},
    });

    const started = this.now().getTime();
    const ctx = {
      run,
      step,
      userId: run.userId,
      workspaceId: run.workspaceId,
      state: run.state,
      db: this.db,
      logger: this.logger,
    };

    try {
      const output = await this.registry.execute(decision.tool, decision.input ?? {}, ctx);
      const latencyMs = this.now().getTime() - started;
      const outputRecord = toRecord(output);
      await this.store.updateStep(step.id, {
        status: "succeeded",
        output: outputRecord,
        latencyMs,
        finishedAt: this.now().toISOString(),
      });

      const nextState = decision.stateKey
        ? { ...run.state, [decision.stateKey]: outputRecord }
        : run.state;

      await this.store.updateRun(runId, {
        phase: decision.nextPhase ?? run.phase,
        state: nextState,
        error: null,
      });
      this.logger.info("tool succeeded", {
        runId,
        tool: decision.tool,
        latencyMs,
        seq,
      });
    } catch (err: any) {
      const latencyMs = this.now().getTime() - started;
      const message = err?.message || "Tool failed";
      await this.store.updateStep(step.id, {
        status: "failed",
        error: message,
        latencyMs,
        finishedAt: this.now().toISOString(),
      });
      await this.store.updateRun(runId, {
        status: "failed",
        phase: "failed",
        error: `${decision.tool}: ${message}`,
        finishedAt: this.now().toISOString(),
      });
      this.logger.error("tool failed", { runId, tool: decision.tool, error: message });
    }

    return this.store.getRun(runId);
  }

  /**
   * Run until the plan pauses for approval, completes, fails, is cancelled, or
   * hits the step ceiling. This is the normal entry point for server actions.
   */
  async runUntilPause(runId: string, maxSteps = this.maxSteps): Promise<RunUntilPauseResult> {
    let run = await this.store.getRun(runId);
    if (!run) throw new Error(`Agent run not found: ${runId}`);

    let executed = 0;
    while (run.status === "running" && executed < maxSteps) {
      run = (await this.advance(runId)) ?? run;
      executed++;
    }

    let stoppedBecause: RunUntilPauseResult["stoppedBecause"] = "max_steps";
    if (run.status === "waiting_approval") stoppedBecause = "approval";
    else if (run.status === "completed") stoppedBecause = "complete";
    else if (run.status === "failed") stoppedBecause = "failed";
    else if (run.status === "cancelled") stoppedBecause = "cancelled";

    const steps = await this.store.listSteps(runId);
    return { run, steps, stoppedBecause };
  }

  async resume(runId: string): Promise<AgentRunRecord | null> {
    const run = await this.store.getRun(runId);
    if (!run || run.status !== "waiting_approval") return run ?? null;
    await this.store.updateRun(runId, { status: "running", error: null });
    return this.store.getRun(runId);
  }

  async retry(runId: string): Promise<AgentRunRecord | null> {
    const run = await this.store.getRun(runId);
    if (!run || (run.status !== "failed" && run.status !== "waiting_approval")) {
      return run ?? null;
    }
    await this.store.updateRun(runId, {
      status: "running",
      error: null,
      finishedAt: null,
    });
    return this.store.getRun(runId);
  }

  async cancel(runId: string): Promise<void> {
    await this.store.updateRun(runId, {
      status: "cancelled",
      finishedAt: this.now().toISOString(),
    });
  }

  private async recordControlStep(
    run: AgentRunRecord,
    patch: {
      status: "succeeded" | "failed";
      output: Record<string, any>;
      error?: string;
    }
  ): Promise<void> {
    const seq = await this.store.nextSeq(run.id);
    const step = await this.store.createStep({
      runId: run.id,
      seq,
      agent: "orchestrator",
      tool: null,
      input: {},
    });
    await this.store.updateStep(step.id, {
      status: patch.status,
      output: patch.output,
      error: patch.error ?? null,
      finishedAt: this.now().toISOString(),
    });
  }
}

export function isTerminalRunStatus(status: string): boolean {
  return ["completed", "failed", "cancelled"].includes(status);
}

export function nextPhaseAfter(phase: AgentPhase): AgentPhase {
  const order: AgentPhase[] = [
    "intake",
    "research",
    "strategy",
    "strategy_review",
    "prospecting",
    "copy",
    "copy_review",
    "launch",
    "monitor",
    "optimize",
    "complete",
  ];
  const idx = order.indexOf(phase);
  return idx >= 0 && idx < order.length - 1 ? order[idx + 1] : "complete";
}

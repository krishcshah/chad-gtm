import type { z } from "zod";

export type AgentRunStatus =
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentPhase =
  | "intake"
  | "research"
  | "strategy"
  | "strategy_review"
  | "prospecting"
  | "copy"
  | "copy_review"
  | "launch"
  | "monitor"
  | "optimize"
  | "complete"
  | "failed";

export type AgentStepStatus = "running" | "succeeded" | "failed" | "skipped";

export interface AgentRunRecord {
  id: string;
  userId: string;
  workspaceId: string | null;
  kind: string;
  goal: string;
  status: AgentRunStatus;
  phase: AgentPhase;
  input: Record<string, any>;
  state: Record<string, any>;
  error: string | null;
  budgetCents: number | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStepRecord {
  id: string;
  runId: string;
  seq: number;
  agent: string;
  tool: string | null;
  status: AgentStepStatus;
  input: Record<string, any>;
  output: Record<string, any>;
  error: string | null;
  latencyMs: number | null;
  tokens: number | null;
  costMicros: number | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
}

export interface AgentLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AgentContext {
  run: AgentRunRecord;
  step: AgentStepRecord;
  userId: string;
  workspaceId: string | null;
  state: Record<string, any>;
  db: any;
  logger: AgentLogger;
}

export interface ToolDefinition<I = any, O = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  timeoutMs?: number;
  requiresApproval?: boolean;
  run(input: I, ctx: AgentContext): Promise<O>;
}

export type PlannerDecision =
  | {
      type: "tool";
      tool: string;
      input: Record<string, any>;
      agent?: string;
      /** Merge the tool output into run.state under this key. */
      stateKey?: string;
      /** Phase to set after the tool succeeds. */
      nextPhase?: AgentPhase;
    }
  | {
      type: "approval";
      phase: AgentPhase;
      reason: string;
    }
  | {
      type: "complete";
      phase?: AgentPhase;
      summary?: string;
    }
  | {
      type: "fail";
      error: string;
    };

export interface Planner {
  next(run: AgentRunRecord): PlannerDecision | Promise<PlannerDecision>;
}

export interface StartAgentRunInput {
  userId: string;
  workspaceId: string | null;
  kind: string;
  goal: string;
  input?: Record<string, any>;
  state?: Record<string, any>;
  budgetCents?: number | null;
}

export interface AgentStore {
  createRun(input: StartAgentRunInput): Promise<AgentRunRecord>;
  getRun(id: string): Promise<AgentRunRecord | null>;
  updateRun(
    id: string,
    patch: Partial<
      Pick<
        AgentRunRecord,
        "status" | "phase" | "state" | "error" | "finishedAt" | "updatedAt"
      >
    >
  ): Promise<void>;
  createStep(input: {
    runId: string;
    seq: number;
    agent: string;
    tool: string | null;
    input: Record<string, any>;
  }): Promise<AgentStepRecord>;
  updateStep(
    id: string,
    patch: Partial<
      Pick<
        AgentStepRecord,
        "status" | "output" | "error" | "latencyMs" | "tokens" | "costMicros" | "finishedAt"
      >
    >
  ): Promise<void>;
  listSteps(runId: string): Promise<AgentStepRecord[]>;
  nextSeq(runId: string): Promise<number>;
}

export interface AgentRuntimeOptions {
  store: AgentStore;
  registry: import("./registry").ToolRegistry;
  planner: Planner;
  db: any;
  maxSteps?: number;
  now?: () => Date;
  logger?: AgentLogger;
}

export interface RunUntilPauseResult {
  run: AgentRunRecord;
  steps: AgentStepRecord[];
  stoppedBecause: "approval" | "complete" | "failed" | "cancelled" | "max_steps";
}

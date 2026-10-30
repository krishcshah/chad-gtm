import type { AgentRunRecord, Planner, PlannerDecision } from "./types";

/**
 * Phase 1 planner: a deterministic, replayable analysis graph.
 *
 * The planner is intentionally not an LLM yet. Phase 2 will add an LLM planner
 * behind the same interface; the runtime, tools, and traces do not change.
 */
export class GtmAnalysisPlanner implements Planner {
  next(run: AgentRunRecord): PlannerDecision {
    const state = run.state ?? {};

    if (!state.scraped) {
      return {
        type: "tool",
        tool: "crawl_company",
        agent: "research",
        input: {
          url: String(run.input?.url || run.goal || ""),
        },
        stateKey: "scraped",
        nextPhase: "research",
      };
    }

    if (!state.strategy) {
      return {
        type: "tool",
        tool: "synthesize_strategy",
        agent: "strategist",
        input: {
          notes: run.input?.notes ?? "",
        },
        stateKey: "strategy",
        nextPhase: "strategy",
      };
    }

    if (!state.persistence?.chadGtmRunId) {
      return {
        type: "tool",
        tool: "persist_gtm_run",
        agent: "orchestrator",
        input: {
          url: run.input?.url || run.goal || "",
          notes: run.input?.notes ?? "",
        },
        stateKey: "persistence",
        nextPhase: "strategy_review",
      };
    }

    return {
      type: "complete",
      phase: "complete",
      summary: `Strategy ready for ${state.strategy?.companyName || "the company"}`,
    };
  }
}

/**
 * Generic planner used by tests and future run kinds. It simply executes the
 * supplied scripted decisions in order.
 */
export class ScriptedPlanner implements Planner {
  private index = 0;

  constructor(private readonly decisions: PlannerDecision[]) {}

  next(): PlannerDecision {
    const decision = this.decisions[this.index];
    this.index++;
    return (
      decision ?? {
        type: "complete",
        phase: "complete",
        summary: "Script complete",
      }
    );
  }
}

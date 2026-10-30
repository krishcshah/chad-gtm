# Agent Runtime (Phase 1)

Phase 1 establishes the harness that Phases 2–7 plug into. It is deliberately
small: a deterministic planner chooses one typed tool at a time, the runtime
persists every transition, and the trace UI makes the run replayable.

## What Phase 1 includes

- `agent_runs` — durable goal, status, phase, input, state, error, budget.
- `agent_steps` — one row per planner decision/tool call, with input, output,
  status, latency, tokens, and cost.
- `ai_generations` — reserved for full prompt/response traces (Phase 1.5).
- `ToolRegistry` — Zod validation, output validation, timeouts, typed errors.
- `AgentRuntime` — start, advance, runUntilPause, resume, retry, cancel.
- `GtmAnalysisPlanner` — crawl → synthesize → persist → complete.
- Tools:
  - `crawl_company`
  - `synthesize_strategy`
  - `persist_gtm_run`
  - `get_directory_facets`
  - `search_leads`
  - `get_campaign_stats`
  - `check_domain_dns`
- Trace page: `/chad-gtm/[id]/trace`.
- `AGENT_RUNTIME_ENABLED=false` disables the harness and uses the legacy direct
  analysis path.

## Run lifecycle

```
intake → research → strategy → strategy_review → complete
```

`analyzeWebsiteAction` starts a `gtm_analysis` run, executes the plan, and
returns the existing `chadGtmRunId` plus the `agentRunId`. If anything in the
harness fails, it logs the failure and falls back to the legacy path. The user
is never blocked by the runtime.

## Tool contract

```ts
const tool: ToolDefinition<Input, Output> = {
  name: "tool_name",
  description: "What it does and when the planner should use it.",
  inputSchema: z.object({ ... }),
  outputSchema: z.object({ ... }),
  timeoutMs: 30_000,
  requiresApproval: false,
  async run(input, ctx) {
    // ctx.state, ctx.db, ctx.userId, ctx.workspaceId, ctx.run, ctx.step
    return output;
  },
};
```

Rules:

- Validate every input before execution.
- Validate every output before persistence.
- Keep tools idempotent; `retry()` re-runs the planner from `run.state`.
- Do not put secrets in tool input/output.
- Do not send email from a tool. Sending stays in the deterministic engine.

## Adding a tool

1. Implement it in `apps/web/lib/agent/tools.ts` (or a new module).
2. Define strict Zod input/output schemas.
3. Register it in `PHASE_1_TOOLS` (or a new phase-specific array).
4. Add a test for validation, timeout, and the happy path.
5. Add the planner decision that calls it.

## Retry and replay

- A failed run persists the failed step and the error.
- `retryAgentRunAction(runId)` sets the run back to `running`; the planner reads
  `run.state` and skips completed work.
- `agent_steps` is append-only; retries create new step rows with the next seq.
- The trace UI shows the full history, including failures.

## Trace UI

Route: `/chad-gtm/[id]/trace`

- Header: status, phase, duration, kind, goal, error.
- Step timeline: seq, agent, tool, status, latency, tokens, cost.
- Input/output JSON: redacted and truncated by `sanitizeForTrace`.
- Link back to Mission Control.

## Phase 1 limitations

- The planner is deterministic. Phase 2 adds an LLM planner behind the same
  interface.
- Tool timeouts use `Promise.race`; the underlying fetch/LLM call is not aborted
  mid-flight. Phase 1 retries are safe because tools are idempotent.
- `ai_generations` is created but not fully populated yet. Prompt/response
  capture is Phase 1.5.
- The existing wizard still uses the legacy human gates; the runtime records the
  analysis but does not yet drive strategy/copy/launch approvals.

## Migration note

The runtime self-heals its tables as the application DB role. If you apply
`apps/web/drizzle/0011_agent_runtime.sql` manually as a superuser, transfer
ownership to the app role before starting the web process:

```sql
ALTER TABLE agent_runs OWNER TO smartreach_user;
ALTER TABLE agent_steps OWNER TO smartreach_user;
ALTER TABLE ai_generations OWNER TO smartreach_user;
GRANT ALL PRIVILEGES ON agent_runs, agent_steps, ai_generations TO smartreach_user;
```


## Tests

```bash
npm run typecheck --workspace=@smartreach/web
npm test --workspace=@smartreach/web
```

Covered:

- Registry rejects invalid input/output.
- Registry times out slow tools.
- Runtime executes steps in order and persists state.
- Runtime pauses for approval and resumes.
- Runtime retries from state without repeating successful work.
- Trace sanitizer redacts secrets and truncates large values.

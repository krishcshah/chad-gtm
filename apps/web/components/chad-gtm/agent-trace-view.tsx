import Link from "next/link";
import { ArrowLeft, Clock, Cpu, GitBranch, Wrench } from "lucide-react";
import type { AgentTracePayload } from "@/lib/agent-actions";
import {
  RUN_STATUS_TONE,
  STEP_STATUS_TONE,
  formatLatency,
  prettyTraceJson,
  runDuration,
  stepSummary,
} from "@/lib/agent/trace";

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone}`}
    >
      {children}
    </span>
  );
}

export function AgentTraceView({ data }: { data: AgentTracePayload }) {
  const { run, steps, chadGtmRun } = data;

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="space-y-2">
          <Link
            href={`/chad-gtm/${chadGtmRun.id}`}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-white"
          >
            <ArrowLeft className="size-3" /> Back to Mission Control
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Agent Trace — {chadGtmRun.companyName || chadGtmRun.url}
          </h1>
          <p className="max-w-2xl text-xs text-zinc-400">
            Every planner decision, tool call, and artifact for this run. Secrets are
            redacted; large values are truncated.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={RUN_STATUS_TONE[run.status] ?? RUN_STATUS_TONE.completed}>
            {run.status.replace(/_/g, " ")}
          </Badge>
          <Badge tone="border-zinc-700 bg-zinc-900 text-zinc-300">
            phase: {run.phase}
          </Badge>
          <Badge tone="border-zinc-700 bg-zinc-900 text-zinc-300">
            {steps.length} steps
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="border border-zinc-800/80 bg-zinc-950/90 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <GitBranch className="size-3" /> Run
          </div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-300">{run.id}</div>
        </div>
        <div className="border border-zinc-800/80 bg-zinc-950/90 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <Clock className="size-3" /> Duration
          </div>
          <div className="mt-1 text-sm font-semibold text-white">{runDuration(run)}</div>
        </div>
        <div className="border border-zinc-800/80 bg-zinc-950/90 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <Cpu className="size-3" /> Kind
          </div>
          <div className="mt-1 font-mono text-xs text-zinc-300">{run.kind}</div>
        </div>
        <div className="border border-zinc-800/80 bg-zinc-950/90 p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            <Wrench className="size-3" /> Goal
          </div>
          <div className="mt-1 truncate text-xs text-zinc-300">{run.goal}</div>
        </div>
      </div>

      {run.error && (
        <div className="border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-300">
          <span className="font-mono text-[10px] uppercase tracking-wider">Run error:</span>{" "}
          {run.error}
        </div>
      )}

      <div className="space-y-3">
        {steps.length === 0 && (
          <div className="border border-zinc-800/80 bg-zinc-950/90 p-6 text-xs text-zinc-500">
            No steps recorded yet.
          </div>
        )}

        {steps.map((step) => (
          <div key={step.id} className="border border-zinc-800/80 bg-zinc-950/90">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-zinc-500">
                  #{String(step.seq).padStart(2, "0")}
                </span>
                <Badge tone={STEP_STATUS_TONE[step.status] ?? STEP_STATUS_TONE.succeeded}>
                  {step.status}
                </Badge>
                <span className="font-mono text-[11px] text-zinc-300">{step.agent}</span>
                {step.tool && (
                  <span className="border border-zinc-800 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                    {step.tool}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
                {step.latencyMs != null && <span>{formatLatency(step.latencyMs)}</span>}
                {step.tokens != null && <span>{step.tokens} tok</span>}
                {step.costMicros != null && (
                  <span>${(step.costMicros / 1_000_000).toFixed(4)}</span>
                )}
              </div>
            </div>

            <div className="space-y-3 p-4">
              <p className="text-xs text-zinc-400">{stepSummary(step)}</p>

              {step.error && (
                <div className="border border-red-500/20 bg-red-500/5 p-3 font-mono text-[11px] text-red-300">
                  {step.error}
                </div>
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                <details className="border border-zinc-800/60 bg-black/30 p-3">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Input
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-zinc-400">
                    {prettyTraceJson(step.input)}
                  </pre>
                </details>
                <details className="border border-zinc-800/60 bg-black/30 p-3">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Output
                  </summary>
                  <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-zinc-400">
                    {prettyTraceJson(step.output)}
                  </pre>
                </details>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

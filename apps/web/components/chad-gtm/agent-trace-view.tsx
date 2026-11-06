import Link from "next/link";
import { ArrowLeft, ChevronRight, ListTree } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataList,
  EmptyState,
  PageHeader,
  Stat,
  cn,
  type BadgeProps,
} from "@smartreach/ui";
import type { AgentTracePayload } from "@/lib/agent-actions";
import type { AgentStepRecord } from "@/lib/agent/types";
import { formatLatency, prettyTraceJson, runDuration, stepSummary } from "@/lib/agent/trace";

const RUN_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  running: { label: "Running", variant: "info" },
  waiting_approval: { label: "Waiting for approval", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const STEP_STATUS: Record<string, { label: string; variant: BadgeProps["variant"]; dot: string }> = {
  running: { label: "Running", variant: "info", dot: "bg-info-soft text-info-text" },
  succeeded: { label: "Succeeded", variant: "success", dot: "bg-success-soft text-success-text" },
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive-soft text-destructive-text" },
  skipped: { label: "Skipped", variant: "outline", dot: "bg-muted text-subtle-foreground" },
};

function humanize(value: string) {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** stepSummary lists output keys for tool steps; say so. */
function describeStep(step: AgentStepRecord) {
  const summary = stepSummary(step);
  return step.tool && summary !== "No output" ? `Returned ${summary}` : summary;
}

function formatCost(micros: number) {
  const dollars = micros / 1_000_000;
  return dollars < 0.01 ? `$${dollars.toFixed(4)}` : `$${dollars.toFixed(2)}`;
}

/** Readable timeline of one agent run: what each step did, with its raw input and output on demand. */
export function AgentTraceView({ data }: { data: AgentTracePayload }) {
  const { run, steps, chadGtmRun } = data;
  const runStatus = RUN_STATUS[run.status] ?? { label: humanize(run.status), variant: "neutral" as const };

  const failed = steps.filter((s) => s.status === "failed").length;
  const withTokens = steps.filter((s) => s.tokens != null);
  const withCost = steps.filter((s) => s.costMicros != null);
  const tokens = withTokens.reduce((n, s) => n + (s.tokens ?? 0), 0);
  const cost = withCost.reduce((n, s) => n + (s.costMicros ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/chad-gtm/${chadGtmRun.id}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            {chadGtmRun.companyName || "Mission control"}
          </Link>
        }
        title="Research trace"
        description="Every planning decision, tool call and result for this run, in order. Secrets are hidden and long values are shortened."
        meta={
          <Badge variant={runStatus.variant} dot>
            {runStatus.label}
          </Badge>
        }
      />

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat bare label="Steps" value={steps.length.toLocaleString()} hint={failed > 0 ? `${failed} failed` : "None failed"} />
        <Stat bare label="Duration" value={runDuration(run)} hint={run.finishedAt ? "Start to finish" : "So far"} />
        <Stat
          bare
          label="Tokens"
          value={withTokens.length > 0 ? tokens.toLocaleString() : "None"}
          hint={withTokens.length > 0 ? "Across model calls" : "Not recorded"}
        />
        <Stat
          bare
          label="Cost"
          value={withCost.length > 0 ? formatCost(cost) : "None"}
          hint={withCost.length > 0 ? "Model and tool spend" : "Not recorded"}
        />
      </Card>

      {run.error && (
        <Alert variant="destructive">
          <AlertTitle>The run stopped with an error</AlertTitle>
          <AlertDescription className="break-words">{run.error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Steps</CardTitle>
            <CardDescription>Open a step to see exactly what went in and what came out.</CardDescription>
          </CardHeader>
          {steps.length === 0 ? (
            <EmptyState
              compact
              icon={ListTree}
              title="No steps recorded yet"
              description="Steps appear here as the agent works. Reload the page to check again."
            />
          ) : (
            <ol className="mt-3 border-t border-border px-5 py-2">
              {steps.map((step, i) => (
                <TraceStep key={step.id} step={step} last={i === steps.length - 1} />
              ))}
            </ol>
          )}
        </Card>

        <Card className="h-fit min-w-0">
          <CardHeader>
            <CardTitle>Run details</CardTitle>
          </CardHeader>
          <div className="px-5 pb-3 pt-2">
            <DataList
              items={[
                { label: "Goal", value: run.goal || "Not set" },
                { label: "Kind", value: <span className="font-mono text-xs">{run.kind}</span> },
                { label: "Phase", value: humanize(run.phase) },
                { label: "Website", value: <span className="break-all">{chadGtmRun.url}</span> },
                { label: "Run ID", value: <span className="break-all font-mono text-xs">{run.id}</span> },
              ]}
            />
          </div>
        </Card>
      </div>
    </>
  );
}

function TraceStep({ step, last }: { step: AgentStepRecord; last: boolean }) {
  const status = STEP_STATUS[step.status] ?? STEP_STATUS.succeeded;
  const meta = [
    step.latencyMs != null ? formatLatency(step.latencyMs) : null,
    step.tokens != null ? `${step.tokens.toLocaleString()} tokens` : null,
    step.costMicros != null ? formatCost(step.costMicros) : null,
  ].filter(Boolean);

  return (
    <li className="relative flex gap-3 py-3">
      <div className="relative flex flex-col items-center">
        <span
          className={cn(
            "tabular flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
            status.dot,
          )}
          aria-hidden
        >
          {step.seq}
        </span>
        {!last && <span className="absolute top-8 h-[calc(100%-20px)] w-px bg-border" aria-hidden />}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="sr-only">Step {step.seq}:</span>
          <span className="text-[13px] font-medium">{humanize(step.agent)}</span>
          {step.tool && (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{step.tool}</code>
          )}
          <Badge variant={status.variant}>{status.label}</Badge>
          {meta.length > 0 && (
            <span className="tabular text-xs text-subtle-foreground sm:ml-auto">{meta.join(" · ")}</span>
          )}
        </div>

        <p className="mt-1 break-words text-[13px] text-muted-foreground">{describeStep(step)}</p>
        {step.error && (
          <p className="mt-1.5 break-words rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive-text">
            {step.error}
          </p>
        )}

        <details className="group mt-2">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
            Input and output
          </summary>
          <div className="mt-2 grid gap-3 xl:grid-cols-2">
            <TraceBlock label="Input" value={step.input} />
            <TraceBlock label="Output" value={step.output} />
          </div>
        </details>
      </div>
    </li>
  );
}

function TraceBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-muted/40">
      <div className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">{label}</div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-foreground">
        {prettyTraceJson(value)}
      </pre>
    </div>
  );
}

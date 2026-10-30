import type { AgentRunRecord, AgentStepRecord } from "./types";

const SECRET_KEY_RE =
  /(password|passwd|secret|token|api[_-]?key|authorization|cookie|refresh|access[_-]?token|private[_-]?key)/i;

/**
 * Make an arbitrary agent artifact safe to render in the trace UI.
 * Secrets are replaced, large strings are truncated, and deep/wide structures
 * are bounded so a runaway tool output cannot freeze the page.
 */
export function sanitizeForTrace(
  value: unknown,
  opts: { maxString?: number; maxArray?: number; maxDepth?: number } = {}
): unknown {
  const maxString = opts.maxString ?? 2_000;
  const maxArray = opts.maxArray ?? 50;
  const maxDepth = opts.maxDepth ?? 6;

  function walk(input: unknown, depth: number, keyHint = ""): unknown {
    if (SECRET_KEY_RE.test(keyHint)) return "[redacted]";
    if (depth > maxDepth) return "[depth limit]";
    if (input === null || input === undefined) return input;
    if (typeof input === "string") {
      return input.length > maxString
        ? `${input.slice(0, maxString)}… [truncated ${input.length - maxString} chars]`
        : input;
    }
    if (typeof input === "number" || typeof input === "boolean") return input;
    if (Array.isArray(input)) {
      const slice = input.slice(0, maxArray).map((item) => walk(item, depth + 1));
      if (input.length > maxArray) {
        slice.push(`… [${input.length - maxArray} more items]`);
      }
      return slice;
    }
    if (typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(input as Record<string, unknown>)) {
        out[key] = walk(child, depth + 1, key);
      }
      return out;
    }
    return String(input);
  }

  return walk(value, 0);
}

export function prettyTraceJson(value: unknown): string {
  try {
    return JSON.stringify(sanitizeForTrace(value), null, 2);
  } catch {
    return String(value);
  }
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms} ms`;
  return `${(ms / 1_000).toFixed(2)} s`;
}

export function stepSummary(step: AgentStepRecord): string {
  if (step.error) return step.error;
  if (step.tool) {
    const keys = Object.keys(step.output ?? {});
    if (keys.length === 0) return "No output";
    return keys.slice(0, 4).join(", ");
  }
  const decision = (step.output as Record<string, any>)?.decision;
  if (decision === "approval") return String((step.output as any).reason ?? "Approval required");
  if (decision === "complete") return String((step.output as any).summary ?? "Run completed");
  return "Control step";
}

export function runDuration(run: AgentRunRecord): string {
  const start = Date.parse(run.startedAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export const RUN_STATUS_TONE: Record<string, string> = {
  running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  waiting_approval: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  completed: "border-zinc-700 bg-zinc-900 text-zinc-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
  cancelled: "border-zinc-700 bg-zinc-900 text-zinc-500",
};

export const STEP_STATUS_TONE: Record<string, string> = {
  running: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  succeeded: "border-zinc-700 bg-zinc-900 text-zinc-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
  skipped: "border-zinc-800 bg-zinc-950 text-zinc-500",
};

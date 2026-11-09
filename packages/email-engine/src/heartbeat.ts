/**
 * Engine liveness: each worker tick upserts its engine_heartbeats row so the
 * web app (/api/health, admin) can tell when sending has stopped.
 */
import { hostname } from "node:os";
import { schema } from "@smartreach/database";
import type { EngineDb } from "./db-port";

export function heartbeatId(host: string = hostname()): string {
  return `worker:${host}`;
}

/** Counts from one tick, flattened for the stats jsonb column. */
export function heartbeatStats(r: {
  sched?: { started?: number; enqueued?: number; completed?: number; skipped?: string[] } | null;
  proc?: { sent?: number; failed?: number; retried?: number; recovered?: number; skipped?: number; held?: number } | null;
  sync?: { checked?: number; repliesFound?: number; bounces?: number; errors?: string[] } | null;
  agent?: {
    processed?: number;
    replied?: number;
    escalated?: number;
    failed?: number;
    retried?: number;
    gaveUp?: number;
  } | null;
  draft?: {
    drafted?: number;
    failed?: number;
    gaveUp?: number;
    fellBack?: number;
    ready?: number;
    waiting?: number;
    running?: number;
  } | null;
}): Record<string, number> {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const stats: Record<string, number> = {
    enqueued: n(r.sched?.enqueued),
    campaignsStarted: n(r.sched?.started),
    campaignsCompleted: n(r.sched?.completed),
    campaignsSkipped: r.sched?.skipped?.length ?? 0,
    sent: n(r.proc?.sent),
    failed: n(r.proc?.failed),
    retried: n(r.proc?.retried),
    recovered: n(r.proc?.recovered),
    held: n(r.proc?.held),
    jobsSkipped: n(r.proc?.skipped),
    agentProcessed: n(r.agent?.processed),
    agentReplied: n(r.agent?.replied),
    agentEscalated: n(r.agent?.escalated),
    agentFailed: n(r.agent?.failed),
    agentRetried: n(r.agent?.retried),
    agentGaveUp: n(r.agent?.gaveUp),
  };
  if (r.draft) {
    // Drafter (written ahead of sending): counts since the last tick, then gauges.
    stats.drafted = n(r.draft.drafted);
    stats.draftFailed = n(r.draft.failed);
    stats.draftGaveUp = n(r.draft.gaveUp);
    stats.draftFellBack = n(r.draft.fellBack);
    stats.draftsReady = n(r.draft.ready);
    stats.draftsWaiting = n(r.draft.waiting);
    stats.drafterRunning = n(r.draft.running);
  }
  if (r.sync) {
    stats.mailboxesSynced = n(r.sync.checked);
    stats.repliesFound = n(r.sync.repliesFound);
    stats.bounces = n(r.sync.bounces);
    stats.syncErrors = r.sync.errors?.length ?? 0;
  }
  return stats;
}

/** Upsert this worker's heartbeat. Never throws: liveness must not break the loop. */
export async function writeHeartbeat(
  db: EngineDb,
  input: { ok: boolean; error?: string | null; stats?: Record<string, unknown>; now?: Date; id?: string },
): Promise<void> {
  const nowS = (input.now ?? new Date()).toISOString();
  const id = input.id ?? heartbeatId();
  const error = input.ok ? null : String(input.error ?? "tick failed").slice(0, 1000);
  try {
    await db
      .insert(schema.engineHeartbeats)
      .values({
        id,
        lastTickAt: nowS,
        lastOkAt: input.ok ? nowS : null,
        lastError: error,
        stats: input.stats ?? {},
        updatedAt: nowS,
      })
      .onConflictDoUpdate({
        target: schema.engineHeartbeats.id,
        set: input.ok
          ? { lastTickAt: nowS, lastOkAt: nowS, lastError: null, stats: input.stats ?? {}, updatedAt: nowS }
          : { lastTickAt: nowS, lastError: error, updatedAt: nowS },
      });
  } catch (err) {
    console.error("[engine] heartbeat write failed:", err);
  }
}

/**
 * Worker loop — composes scheduler + processor + reply sync into one tick.
 * Same entry used by:
 *   - the standalone Node worker (`npm run worker`)
 *   - Cloudflare Cron Triggers (see workers/cron in the web app)
 *   - the Next.js dev runtime (lib/engine.ts) for zero-infra local development
 */
import { schedulerTick, startDueCampaigns } from "./scheduler";
import { processTick } from "./processor";
import { syncTick } from "./sync-replies";
import { replyAgentTick } from "./reply-agent";
import type { EngineDb } from "./db-port";
import { heartbeatStats, writeHeartbeat } from "./heartbeat";

export interface EngineTickOptions {
  withSync?: boolean;
}

export async function engineTick(db: EngineDb, opts: EngineTickOptions = {}) {
  const startedAt = new Date().toISOString();
  const sched = await schedulerTick(db);
  const proc = await processTick(db);
  const sync = opts.withSync ? await syncTick(db) : null;
  // Reply agent runs every tick: it is a cheap indexed lookup when idle and
  // keeps response time to a new reply within one engine interval.
  const agent = await replyAgentTick(db).catch((err) => {
    console.error("[worker] reply agent tick failed:", err);
    return null;
  });
  return { startedAt, sched, proc, sync, agent };
}

export interface WorkerLoopOptions {
  intervalMs?: number;
  syncEveryTicks?: number;
  onTick?: (r: Awaited<ReturnType<typeof engineTick>>) => void;
}

let running = false;
let ticks = 0;

/** Plain setInterval loop for Node (long-running). Idempotent. */
export function startWorkerLoop(db: EngineDb, options: WorkerLoopOptions = {}): () => void {
  const intervalMs = options.intervalMs ?? Number(process.env.ENGINE_INTERVAL_MS ?? 30_000);
  const syncEvery = options.syncEveryTicks ?? 4;
  const timer = setInterval(async () => {
    if (running) return; // skip overlapping tick
    running = true;
    try {
      const r = await engineTick(db, { withSync: ticks % syncEvery === syncEvery - 1 });
      ticks++;
      await writeHeartbeat(db, { ok: true, stats: heartbeatStats(r) });
      options.onTick?.(r);
    } catch (err) {
      console.error("[worker] tick failed:", err);
      await writeHeartbeat(db, { ok: false, error: String((err as Error)?.message || err) });
    } finally {
      running = false;
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

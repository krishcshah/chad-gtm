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
import { retestFailedSenders } from "./mailbox-health";
import type { EngineDb } from "./db-port";
import { heartbeatStats, writeHeartbeat } from "./heartbeat";
import { kickDrafter, startDrafterLoop, takeDrafterStats } from "./drafter";

export interface EngineTickOptions {
  withSync?: boolean;
  /** Start a drafter pass if none is running (default true). Never awaited. */
  draft?: boolean;
}

export async function engineTick(db: EngineDb, opts: EngineTickOptions = {}) {
  const startedAt = new Date().toISOString();
  // Emails are written by the drafter on its own: kick a pass, never wait for it.
  if (opts.draft !== false) kickDrafter(db);
  const sched = await schedulerTick(db);
  const proc = await processTick(db);
  const sync = opts.withSync ? await syncTick(db) : null;
  // Failed mailboxes get a real SMTP + IMAP login re-test after a cool-off.
  const retest = opts.withSync
    ? await retestFailedSenders(db).catch((err) => {
        console.error("[worker] mailbox re-test failed:", err);
        return null;
      })
    : null;
  // Reply agent runs every tick: it is a cheap indexed lookup when idle and
  // keeps response time to a new reply within one engine interval.
  const agent = await replyAgentTick(db).catch((err) => {
    console.error("[worker] reply agent tick failed:", err);
    return null;
  });
  return { startedAt, sched, proc, sync, agent, retest, draft: takeDrafterStats() };
}

export interface WorkerLoopOptions {
  intervalMs?: number;
  syncEveryTicks?: number;
  /** Drafter loop interval (default ENGINE_DRAFT_INTERVAL_MS or 20 s). */
  draftIntervalMs?: number;
  onTick?: (r: Awaited<ReturnType<typeof engineTick>>) => void;
}

let running = false;
let ticks = 0;

/**
 * Plain setInterval loop for Node (long-running). Idempotent. The drafter
 * runs its own loop alongside, so writing never holds up sends or replies.
 */
export function startWorkerLoop(db: EngineDb, options: WorkerLoopOptions = {}): () => void {
  const stopDrafter = startDrafterLoop(db, { intervalMs: options.draftIntervalMs });
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
  return () => {
    clearInterval(timer);
    stopDrafter();
  };
}

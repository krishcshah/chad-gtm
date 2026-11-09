/**
 * Standalone worker entry — `npm run worker`.
 * Loads env, builds the same DB the web app uses, and runs the loop forever.
 *
 * ESM evaluates static imports before this module's body runs, so anything
 * that reads configuration (worker → processor → …) is imported dynamically,
 * after dotenv has loaded. Only load-env (dotenv + node builtins) is static.
 */
import { loadEngineEnv } from "./load-env";

async function main(): Promise<void> {
  loadEngineEnv();

  if (!process.env.BETTER_AUTH_SECRET) {
    console.warn(
      "[engine] BETTER_AUTH_SECRET is unset after dotenv load — unsubscribe tokens will not verify in the web app",
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[engine] DATABASE_URL is not set");
    process.exit(1);
  }

  const { configuredAppUrl, appUrlReadyForLiveSend } = await import("./env");
  const { isEngineDryRun } = await import("./queue-mode");
  const publicUrl = configuredAppUrl();
  if (!publicUrl) {
    console.error(
      "[engine] ************************************************************\n" +
        "[engine] APP_URL is NOT set. Unsubscribe and tracking links cannot be built.\n" +
        "[engine] Live sends are held until APP_URL is set (e.g. https://autogtm.tech).\n" +
        "[engine] ************************************************************",
    );
  } else if (!isEngineDryRun() && !appUrlReadyForLiveSend()) {
    console.error(`[engine] APP_URL=${publicUrl} is not a public https origin; live sends are held.`);
  } else {
    console.log(`[engine] public links use ${publicUrl}`);
  }

  const { createDb } = await import("@smartreach/database/connection");
  const { startWorkerLoop } = await import("./worker");

  const { db } = createDb(url);
  const intervalMs = Number(process.env.ENGINE_INTERVAL_MS ?? 30_000);

  const { draftConcurrency, draftIntervalMs } = await import("./drafter");
  console.log(`[engine] AutoGTM sending engine online — tick every ${intervalMs}ms`);
  console.log(
    `[engine] drafter writes emails ahead of sending — ${draftConcurrency()} at a time, pass every ${draftIntervalMs()}ms`,
  );

  // Never let a stray async failure take down the dispatch loop. PM2 restarts
  // are acceptable for a hard crash, but a single bad IMAP socket should not
  // interrupt sending for every mailbox.
  process.on("unhandledRejection", (reason) => {
    console.error("[engine] unhandled rejection:", reason);
  });

  const stop = startWorkerLoop(db, {
    intervalMs,
    onTick: (r) => {
      const s = r.sched;
      const p = r.proc as { sent?: number; failed?: number; retried?: number; held?: number };
      if (s.enqueued > 0 || (p.sent ?? 0) > 0 || (p.failed ?? 0) > 0) {
        console.log(
          `[engine] ${new Date().toISOString()} enqueued=${s.enqueued} sent=${p.sent ?? 0} failed=${p.failed ?? 0} retried=${p.retried ?? 0} held=${p.held ?? 0}` +
            (s.skipped.length ? ` skipped=[${s.skipped.join(", ")}]` : ""),
        );
      }
      if (r.sync && (r.sync.bounces ?? 0) > 0) {
        console.log(`[engine] hard bounces recorded=${r.sync.bounces}`);
      }
      const a = r.agent;
      if (a && a.processed > 0) {
        console.log(
          `[engine] reply-agent processed=${a.processed} replied=${a.replied} escalated=${a.escalated} skipped=${a.skipped} failed=${a.failed}`,
        );
      }
    },
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log("\n[engine] shutting down");
      stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("[engine] failed to start:", err);
  process.exit(1);
});

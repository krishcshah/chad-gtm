/**
 * Standalone worker entry — `npm run worker`.
 * Loads env, builds the same DB the web app uses, and runs the loop forever.
 */
import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "@smartreach/database/connection";
import { startWorkerLoop } from "./worker";

const here = path.dirname(fileURLToPath(import.meta.url));
// Package root whether we run from src/ (tsx) or dist/
const pkgRoot = path.resolve(here, "..");
const repoRoot = path.resolve(pkgRoot, "..", "..");
// Engine package env first, then web .env.local so BETTER_AUTH_SECRET matches the app
// (unsubscribe HMAC parity — F16 / Sentinel BLOCKING).
config({ path: path.join(pkgRoot, ".env") });
config({ path: path.join(repoRoot, "apps", "web", ".env.local") });
config({ path: path.join(repoRoot, ".env") });
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

const { db } = createDb(url);
const intervalMs = Number(process.env.ENGINE_INTERVAL_MS ?? 30_000);
const syncMs = Number(process.env.ENGINE_SYNC_MS ?? 120_000);

console.log(`[engine] SmartReach sending engine online — tick every ${intervalMs}ms, IMAP sync every ${syncMs}ms`);

const stop = startWorkerLoop(db, {
  intervalMs,
  onTick: (r) => {
    const s = r.sched;
    const p = r.proc as { sent?: number; failed?: number; retried?: number };
    if (s.enqueued > 0 || (p.sent ?? 0) > 0 || (p.failed ?? 0) > 0) {
      console.log(
        `[engine] ${new Date().toISOString()} enqueued=${s.enqueued} sent=${p.sent ?? 0} failed=${p.failed ?? 0} retried=${p.retried ?? 0}` +
          (s.skipped.length ? ` skipped=[${s.skipped.join(", ")}]` : ""),
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

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { evaluateHealth, firstValue, isStrictRequest } from "@/lib/health";

/**
 * Liveness for the deploy check and uptime monitors.
 *
 *   GET /api/health           200 while the database answers, 503 otherwise
 *   GET /api/health?strict=1  also 503 when the engine has not ticked for 10 min
 *
 * Returns only booleans and the last engine tick time: no secrets, no
 * mailbox or user data, no error text.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const QUERY_TIMEOUT_MS = 3_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export async function GET(req: Request) {
  const strict = isStrictRequest(new URL(req.url).searchParams);
  let dbOk = false;
  let lastTickAt: unknown = null;

  try {
    // Imported lazily so a bad env (lib/env.ts throws in production) is a 503, not a crash.
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    await withTimeout(Promise.resolve(db.execute(sql`select 1`)), QUERY_TIMEOUT_MS);
    dbOk = true;
    try {
      const res = await withTimeout(
        Promise.resolve(db.execute(sql`select max(last_tick_at) as last_tick_at from engine_heartbeats`)),
        QUERY_TIMEOUT_MS,
      );
      lastTickAt = firstValue(res);
    } catch (err) {
      // Table missing before migration 0013, or a slow query: report the engine as stale.
      console.warn("[health] engine heartbeat lookup failed:", (err as Error)?.message);
    }
  } catch (err) {
    console.error("[health] database check failed:", (err as Error)?.message);
  }

  const { status, body } = evaluateHealth({ dbOk, lastTickAt, now: new Date(), strict });
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

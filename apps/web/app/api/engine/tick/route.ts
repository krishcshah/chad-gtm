import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow full 60s timeout on Vercel

export async function GET(req: Request) {
  // Optional secret auth for external callers / cron triggers
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // If CRON_SECRET is configured, enforce it (Vercel automatically sets Bearer token for cron jobs)
    const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron");
    if (!isVercelCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const { engineTick } = await import("@smartreach/email-engine");
    const db = getDb();
    const result = await engineTick(db as any, { withSync: true });
    return NextResponse.json({ ok: true, data: result });
  } catch (err: any) {
    console.error("[engine-tick-api] Execution failed:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Engine tick failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

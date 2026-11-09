import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { authorizeCronRequest, summarizeCounts } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // This endpoint sends real email and replies to leads. Only a caller holding
  // CRON_SECRET may trigger it; in production it is disabled when the secret
  // is unset. The PM2 worker does not use this route.
  const auth = authorizeCronRequest(req.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { engineTick } = await import("@smartreach/email-engine");
    const db = getDb();
    // No drafter pass here: the PM2 worker's own drafter loop writes emails.
    // A pass started in this request would be cut off at maxDuration.
    const result = await engineTick(db as any, { withSync: true, draft: false });
    // Counts only: never echo mailbox addresses, error text or campaign names.
    return NextResponse.json({ ok: true, data: summarizeCounts(result) });
  } catch (err) {
    console.error("[engine-tick-api] Execution failed:", err);
    return NextResponse.json({ ok: false, error: "Engine tick failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}

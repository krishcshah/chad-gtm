import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { getDb } from "@/lib/db";
import { schema } from "@smartreach/database";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let body: { path?: string; referrer?: string; pageTitle?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Beacon may send text or empty body
    }

    const path = (body.path || "").trim();
    if (!path || path.startsWith("/api") || path.startsWith("/_next")) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const session = await getSession();
    // Only track if user is logged in (as required: which user visited how many pages)
    if (!session?.user) {
      return NextResponse.json({ ok: true, anonymous: true });
    }

    const hdrs = await headers();
    const userAgent = hdrs.get("user-agent") || "";
    const ipAddress = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

    const db = getDb();
    await db
      .insert(schema.pageViews)
      .values({
        userId: session.user.id,
        path: path.slice(0, 500),
        pageTitle: (body.pageTitle || "").slice(0, 500),
        referrer: (body.referrer || "").slice(0, 500),
        userAgent: userAgent.slice(0, 500),
        ipAddress: ipAddress.slice(0, 100),
        createdAt: new Date().toISOString(),
      })
      .catch((err) => {
        console.warn("[page-view-tracker] DB insert failed:", err?.message);
      });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[page-view-tracker] handler exception:", msg);
    return NextResponse.json({ ok: true, error: msg });
  }
}

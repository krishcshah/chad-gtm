import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "@/lib/db";
import { clickFallbackUrl, resolveTrackedDestination } from "@/lib/click-tracking";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jid = url.searchParams.get("jid");
  const target = url.searchParams.get("url");

  const fallback = () =>
    NextResponse.redirect(clickFallbackUrl(req.url), { status: 302, headers: NO_STORE });

  // Only redirect to a link that was actually part of this tracked email.
  // Anything else (no job, unknown job, forged url) lands on APP_URL.
  if (!jid || !target || jid.length > 128) return fallback();

  let job:
    | {
        id: string;
        campaignId: string;
        leadId: string;
        userId: string;
        bodyHtml: string | null;
        bodyText: string | null;
      }
    | undefined;
  try {
    const db = getDb();
    [job] = await db
      .select({
        id: schema.emailJobs.id,
        campaignId: schema.emailJobs.campaignId,
        leadId: schema.emailJobs.leadId,
        userId: schema.campaigns.userId,
        bodyHtml: schema.emailJobs.bodyHtml,
        bodyText: schema.emailJobs.bodyText,
      })
      .from(schema.emailJobs)
      .innerJoin(schema.campaigns, eq(schema.emailJobs.campaignId, schema.campaigns.id))
      .where(eq(schema.emailJobs.id, jid))
      .limit(1);
  } catch {
    return fallback();
  }

  const destination = resolveTrackedDestination(target, job);
  if (!job || !destination) return fallback();

  try {
    const db = getDb();
    await db.insert(schema.emailTrackingEvents).values({
      userId: job.userId,
      campaignId: job.campaignId,
      jobId: job.id,
      leadId: job.leadId,
      type: "click",
      targetUrl: destination.slice(0, 2000),
      userAgent: (req.headers.get("user-agent") || "").slice(0, 500),
      ip: (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "").slice(0, 100),
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Logging must never block the redirect.
  }

  return NextResponse.redirect(destination, { status: 302, headers: NO_STORE });
}

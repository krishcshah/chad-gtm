import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "@/lib/db";

// 1x1 Transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jid = url.searchParams.get("jid");

    if (jid) {
      const db = getDb();
      const [job] = await db
        .select({
          id: schema.emailJobs.id,
          campaignId: schema.emailJobs.campaignId,
          leadId: schema.emailJobs.leadId,
          userId: schema.campaigns.userId,
        })
        .from(schema.emailJobs)
        .innerJoin(schema.campaigns, eq(schema.emailJobs.campaignId, schema.campaigns.id))
        .where(eq(schema.emailJobs.id, jid))
        .limit(1);

      if (job) {
        const userAgent = req.headers.get("user-agent") || "";
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "";

        await db
          .insert(schema.emailTrackingEvents)
          .values({
            userId: job.userId,
            campaignId: job.campaignId,
            jobId: job.id,
            leadId: job.leadId,
            type: "open",
            userAgent,
            ip,
            createdAt: new Date().toISOString(),
          })
          .catch(() => {});
      }
    }
  } catch {
    // Fail silently to never break email display
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

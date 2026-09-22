import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
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
      // Ensure email_tracking_events table exists
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS email_tracking_events (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          campaign_id text,
          job_id text,
          lead_id text,
          type text NOT NULL,
          target_url text,
          ip text,
          user_agent text,
          created_at text NOT NULL
        );
        CREATE INDEX IF NOT EXISTS email_tracking_user_type_idx ON email_tracking_events(user_id, type, created_at);
        CREATE INDEX IF NOT EXISTS email_tracking_campaign_type_idx ON email_tracking_events(campaign_id, type, created_at);
        CREATE INDEX IF NOT EXISTS email_tracking_job_idx ON email_tracking_events(job_id, type);
      `).catch(() => {});

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

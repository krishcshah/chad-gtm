import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jid = url.searchParams.get("jid");
  const target = url.searchParams.get("url");

  const fallbackRedirect = "/";

  if (!target) {
    return NextResponse.redirect(new URL(fallbackRedirect, req.url));
  }

  let destination = target;
  try {
    destination = decodeURIComponent(target);
    const parsed = new URL(destination);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.redirect(new URL(fallbackRedirect, req.url));
    }
  } catch {
    return NextResponse.redirect(new URL(fallbackRedirect, req.url));
  }

  if (jid) {
    try {
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
            type: "click",
            targetUrl: destination,
            userAgent,
            ip,
            createdAt: new Date().toISOString(),
          })
          .catch(() => {});
      }
    } catch {
      // Fail safely without blocking redirect
    }
  }

  return NextResponse.redirect(destination, 302);
}

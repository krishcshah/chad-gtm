import { desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { UniboxClient } from "./unibox-client";

export const dynamic = "force-dynamic";

export default async function UniboxPage() {
  const user = await requireUser();
  const db = getDb();
  const t = schema;

  const rows = await db
    .select({
      id: t.replies.id,
      fromName: t.replies.fromName,
      fromEmail: t.replies.fromEmail,
      subject: t.replies.subject,
      snippet: t.replies.snippet,
      bodyText: t.replies.bodyText,
      bodyHtml: t.replies.bodyHtml,
      receivedAt: t.replies.receivedAt,
      readAt: t.replies.readAt,
      campaignName: t.campaigns.name,
      senderEmail: t.senderAccounts.email,
      senderName: t.senderAccounts.senderName,
    })
    .from(t.replies)
    .leftJoin(t.campaigns, eq(t.replies.campaignId, t.campaigns.id))
    .leftJoin(t.senderAccounts, eq(t.replies.senderId, t.senderAccounts.id))
    .where(eq(t.replies.userId, user.id))
    .orderBy(desc(t.replies.receivedAt))
    .limit(200);

  return <UniboxClient initial={JSON.parse(JSON.stringify(rows))} />;
}

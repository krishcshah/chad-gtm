import { and, desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { UNIBOX_REPLY_TAGS, type UniboxReplyTag } from "@smartreach/shared";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { UniboxClient } from "./unibox-client";

export const dynamic = "force-dynamic";

function parseTag(raw: string | undefined): UniboxReplyTag | null {
  if (!raw) return null;
  return (UNIBOX_REPLY_TAGS as readonly string[]).includes(raw) ? (raw as UniboxReplyTag) : null;
}

export default async function UniboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const tag = parseTag(sp.tag);
  const db = getDb();
  const t = schema;
  const conds = [eq(t.replies.userId, user.id)];
  if (tag) conds.push(eq(t.replies.tag, tag));

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
      tag: t.replies.tag,
      campaignName: t.campaigns.name,
      senderEmail: t.senderAccounts.email,
      senderName: t.senderAccounts.senderName,
    })
    .from(t.replies)
    .leftJoin(t.campaigns, eq(t.replies.campaignId, t.campaigns.id))
    .leftJoin(t.senderAccounts, eq(t.replies.senderId, t.senderAccounts.id))
    .where(and(...conds))
    .orderBy(desc(t.replies.receivedAt))
    .limit(200);

  return (
    <UniboxClient initial={JSON.parse(JSON.stringify(rows))} initialTag={tag ?? ""} />
  );
}

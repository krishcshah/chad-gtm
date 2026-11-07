import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { UNIBOX_REPLY_TAGS, type UniboxReplyTag } from "@smartreach/shared";
import { getDb } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { INBOX_QUERY_MAX } from "@/lib/unibox-inbox";
import { loadInboxIndex, loadInboxPage } from "@/lib/unibox-query";
import { wsCondition } from "@/lib/queries";
import { Page } from "@/components/layout/page";
import { UniboxClient } from "./unibox-client";
import type { InboxView, OpenRequestRow } from "./inbox-utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

function parseTag(raw: string | undefined): UniboxReplyTag | null {
  if (!raw) return null;
  return (UNIBOX_REPLY_TAGS as readonly string[]).includes(raw) ? (raw as UniboxReplyTag) : null;
}

const VIEWS: readonly InboxView[] = ["all", "unread", "awaiting", "needs_you"];

function parseView(raw: string | undefined): InboxView {
  return raw && (VIEWS as readonly string[]).includes(raw) ? (raw as InboxView) : "all";
}

export default async function UniboxPage({
  searchParams,
}: {
  /** `reply`: a reply id to open (any message of the conversation). `view`: e.g. `awaiting` (Awaiting your reply). */
  searchParams: Promise<{ tag?: string; reply?: string; view?: string; q?: string; campaign?: string }>;
}) {
  const { user, workspace } = await requireWorkspace();
  const sp = await searchParams;
  const tag = parseTag(sp.tag);
  const initialView = parseView(sp.view);
  const db = getDb();
  const t = schema;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, INBOX_QUERY_MAX) : "";
  const campaignId = typeof sp.campaign === "string" && sp.campaign.length <= 200 ? sp.campaign || null : null;
  const focusReplyId = typeof sp.reply === "string" && sp.reply ? sp.reply : null;

  // Grouped, filtered and paged over every reply in scope (same workspace scope as the sidebar's
  // "Awaiting your reply" count). Tag filters whole conversations, and every message of each listed
  // conversation is loaded, so the newest message is always the one you answer.
  const page = await loadInboxPage(user.id, workspace, { view: initialView, tag, q, campaignId, focusReplyId });
  const withHandlers = page.rows;
  const requestRows = await db
    .select({
      id: t.agentRequests.id,
      replyId: t.agentRequests.replyId,
      leadId: t.agentRequests.leadId,
      campaignId: t.agentRequests.campaignId,
      kind: t.agentRequests.kind,
      title: t.agentRequests.title,
      question: t.agentRequests.question,
      draftReply: t.agentRequests.draftReply,
      draftSource: t.agentRequests.draftSource,
      pendingKnowledge: t.agentRequests.pendingKnowledge,
      createdAt: t.agentRequests.createdAt,
    })
    .from(t.agentRequests)
    .where(
      and(
        eq(t.agentRequests.userId, user.id),
        inArray(t.agentRequests.status, ["open", "sending"]),
        // Same scope as the Needs you page and the sidebar badge.
        wsCondition(t.agentRequests.workspaceId, workspace.id, workspace.isDefault),
      ),
    )
    .orderBy(desc(t.agentRequests.createdAt))
    .limit(200);
  const openRequests: OpenRequestRow[] = requestRows.map(({ pendingKnowledge, draftSource, ...r }) => ({
    ...r,
    draftSource: draftSource === "you" ? "you" : "agent",
    hasPendingKnowledge: Boolean(pendingKnowledge?.save),
  }));
  // Last sends from the same per-request load as the counts above (cached: no second query).
  const { outbound } = await loadInboxIndex(user.id, workspace);

  return (
    // A fixed height (not flex-1, which grows with content) keeps the panes scrolling on their
    // own and the reply box in view. On phones the app header takes 3.5rem.
    <Page full className="h-[calc(100dvh-3.5rem)] flex-none overflow-hidden lg:h-dvh">
      <UniboxClient
        initial={JSON.parse(JSON.stringify(withHandlers))}
        initialTag={tag ?? ""}
        initialReplyId={typeof sp.reply === "string" && sp.reply ? sp.reply : null}
        openRequests={JSON.parse(JSON.stringify(openRequests))}
        initialView={initialView}
        outbound={outbound}
        conversations={page.conversations}
        counts={page.counts}
        nextCursor={page.nextCursor}
        capped={page.capped}
        params={{ view: initialView, tag: tag ?? "", q, campaignId }}
      />
    </Page>
  );
}

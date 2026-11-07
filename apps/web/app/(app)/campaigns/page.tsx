import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { schema } from "@smartreach/database";
import { formatDate } from "@smartreach/shared";
import { Button, PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listCampaigns, listLeadLists } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { getPostalHold, isSendingStatus } from "@/lib/postal-hold";
import { Page } from "@/components/layout/page";
import { PostalHoldNotice } from "../postal-hold-notice";
import { CampaignTable, type CampaignListItem } from "./campaign-table";
import type { LeadListItem } from "./lead-lists-section";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campaigns & leads" };

/** Lead list per campaign, for the "Campaign" column and the lists' "Used by". */
async function leadListNames(userId: string): Promise<Map<string, { listId: string; listName: string }>> {
  try {
    const rows = await getDb()
      .select({ campaignId: schema.campaigns.id, listId: schema.leadLists.id, listName: schema.leadLists.name })
      .from(schema.campaigns)
      .innerJoin(
        schema.leadLists,
        and(eq(schema.leadLists.id, schema.campaigns.leadListId), eq(schema.leadLists.userId, userId)),
      )
      .where(and(eq(schema.campaigns.userId, userId), isNull(schema.campaigns.deletedAt)));
    return new Map(rows.map((r) => [r.campaignId, { listId: r.listId, listName: r.listName }]));
  } catch {
    // The list name is a nicety; the table still renders without it.
    return new Map();
  }
}

export default async function CampaignsPage() {
  const { user, workspace } = await requireWorkspace();
  const [campaigns, postalHold, listNames, lists] = await Promise.all([
    listCampaigns(user.id, workspace.id, workspace.isDefault),
    getPostalHold(user.id),
    leadListNames(user.id),
    listLeadLists(user.id, workspace.id, workspace.isDefault),
  ]);

  // Campaign names per list id, from this workspace's campaigns only.
  const usedBy = new Map<string, string[]>();
  for (const c of campaigns) {
    const listId = listNames.get(c.id)?.listId;
    if (!listId) continue;
    usedBy.set(listId, [...(usedBy.get(listId) ?? []), c.name]);
  }
  const leadLists: LeadListItem[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    leadCount: l.leadCount,
    createdLabel: formatDate(l.createdAt),
    usedBy: usedBy.get(l.id) ?? [],
  }));

  const items: CampaignListItem[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    createdLabel: formatDate(c.createdAt),
    scheduledLabel: c.scheduledAt ? formatDate(c.scheduledAt) : null,
    leadListName: listNames.get(c.id)?.listName ?? null,
    total: Number(c.total || 0),
    sent: Number(c.sent || 0),
    replied: Number(c.replied || 0),
    failed: Number(c.failed || 0),
    held: postalHold.held && isSendingStatus(c.status),
    autopilotRunId: c.autopilotRunId ?? null,
  }));

  return (
    <Page>
      <PageHeader
        title="Campaigns & leads"
        description="Your campaigns, how far each has got, and the lead lists they send to."
        actions={
          items.length > 0 ? (
            <>
              <Button asChild variant="outline">
                <Link href="/chad-gtm">
                  <Bot />
                  Run autopilot
                </Link>
              </Button>
              <Button asChild>
                <Link href="/campaigns/new">
                  <Plus />
                  New campaign
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <PostalHoldNotice hold={postalHold} />

      <CampaignTable campaigns={items} leadLists={leadLists} />
    </Page>
  );
}

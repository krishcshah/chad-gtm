import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { Bot, Plus } from "lucide-react";
import { schema } from "@smartreach/database";
import { formatDate } from "@smartreach/shared";
import { Button, PageHeader } from "@smartreach/ui";
import { requireWorkspace } from "@/lib/session";
import { listCampaigns } from "@/lib/queries";
import { getDb } from "@/lib/db";
import { getPostalHold } from "@/lib/postal-hold";
import { Page } from "@/components/layout/page";
import { PostalHoldNotice } from "../postal-hold-notice";
import { CampaignTable, type CampaignListItem } from "./campaign-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "Campaigns" };

/** Lead list name per campaign, for the "Campaign" column. */
async function leadListNames(userId: string): Promise<Map<string, string>> {
  try {
    const rows = await getDb()
      .select({ campaignId: schema.campaigns.id, listName: schema.leadLists.name })
      .from(schema.campaigns)
      .innerJoin(
        schema.leadLists,
        and(eq(schema.leadLists.id, schema.campaigns.leadListId), eq(schema.leadLists.userId, userId)),
      )
      .where(and(eq(schema.campaigns.userId, userId), isNull(schema.campaigns.deletedAt)));
    return new Map(rows.map((r) => [r.campaignId, r.listName]));
  } catch {
    // The list name is a nicety; the table still renders without it.
    return new Map();
  }
}

export default async function CampaignsPage() {
  const { user, workspace } = await requireWorkspace();
  const [campaigns, postalHold, listNames] = await Promise.all([
    listCampaigns(user.id, workspace.id, workspace.isDefault),
    getPostalHold(user.id),
    leadListNames(user.id),
  ]);

  const items: CampaignListItem[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    createdLabel: formatDate(c.createdAt),
    scheduledLabel: c.scheduledAt ? formatDate(c.scheduledAt) : null,
    leadListName: listNames.get(c.id) ?? null,
    total: Number(c.total || 0),
    sent: Number(c.sent || 0),
    replied: Number(c.replied || 0),
    failed: Number(c.failed || 0),
  }));

  return (
    <Page>
      <PageHeader
        title="Campaigns"
        description="Every outbound campaign, how far it has got through its leads and who replied."
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

      <CampaignTable campaigns={items} />
    </Page>
  );
}

/**
 * The workspace booking link (Settings › Lead conversations).
 *
 * Effective link for an Autopilot run = its own link, else the workspace's.
 * Runs with their own link are never changed by the default.
 *
 * Deliberately NOT a "use server" module: these take a trusted user id and are
 * only called from server actions.
 */
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { wsCondition } from "./queries";
import { releaseBookingLinkRequests } from "./lead-conversations-server";

type AnyDb = any;

export interface OwnedWorkspace {
  id: string;
  name: string;
  isDefault: boolean;
  bookingUrl: string | null;
}

/** The user's workspace `workspaceId`, or their default (else oldest) one when null. */
export async function loadOwnedWorkspace(
  db: AnyDb,
  userId: string,
  workspaceId: string | null,
): Promise<OwnedWorkspace | null> {
  const cols = {
    id: schema.workspaces.id,
    name: schema.workspaces.name,
    isDefault: schema.workspaces.isDefault,
    bookingUrl: schema.workspaces.bookingUrl,
  };
  const [row]: any[] =
    workspaceId && workspaceId !== "primary-default"
      ? await db
          .select(cols)
          .from(schema.workspaces)
          .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, userId)))
          .limit(1)
      : await db
          .select(cols)
          .from(schema.workspaces)
          .where(eq(schema.workspaces.userId, userId))
          .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt)
          .limit(1);
  if (!row) return null;
  return { id: row.id, name: row.name ?? "", isDefault: Boolean(row.isDefault), bookingUrl: row.bookingUrl || null };
}

/**
 * Live campaigns of the workspace that use the workspace link: their
 * Autopilot run (if any) has no link of its own. A campaign without a
 * workspace takes its run's, as the reply agent does.
 */
export async function campaignsOnWorkspaceBookingLink(db: AnyDb, userId: string, ws: OwnedWorkspace): Promise<string[]> {
  const rows: any[] = await db
    .select({ id: schema.campaigns.id, runBookingUrl: schema.chadGtmRuns.bookingUrl })
    .from(schema.campaigns)
    .leftJoin(schema.chadGtmRuns, eq(schema.chadGtmRuns.campaignId, schema.campaigns.id))
    .where(
      and(
        eq(schema.campaigns.userId, userId),
        isNull(schema.campaigns.deletedAt),
        wsCondition(sql`coalesce(${schema.campaigns.workspaceId}, ${schema.chadGtmRuns.workspaceId})`, ws.id, ws.isDefault),
      ),
    );
  return [...new Set(rows.filter((r) => !String(r.runBookingUrl ?? "").trim()).map((r) => String(r.id)))];
}

/**
 * Save (or clear, with null) the workspace booking link. When set, the open
 * "booking link" cards of campaigns that use it are released with the same
 * safe logic as a run's link: only replies nobody answered since go back to
 * the agent; the rest close as handled in the Inbox. Nothing is sent here.
 */
export async function saveWorkspaceBookingUrl(
  db: AnyDb,
  input: { userId: string; workspace: OwnedWorkspace; bookingUrl: string | null; nowIso: string },
): Promise<{ saved: boolean; answered: number }> {
  const updated: any[] = await db
    .update(schema.workspaces)
    .set({ bookingUrl: input.bookingUrl, updatedAt: input.nowIso })
    .where(and(eq(schema.workspaces.id, input.workspace.id), eq(schema.workspaces.userId, input.userId)))
    .returning({ id: schema.workspaces.id });
  if (updated.length === 0) return { saved: false, answered: 0 };
  if (!input.bookingUrl) return { saved: true, answered: 0 };
  const campaignIds = await campaignsOnWorkspaceBookingLink(db, input.userId, input.workspace);
  if (campaignIds.length === 0) return { saved: true, answered: 0 };
  const { answered } = await releaseBookingLinkRequests(db, {
    userId: input.userId,
    campaignIds,
    bookingUrl: input.bookingUrl,
    nowIso: input.nowIso,
  });
  return { saved: true, answered };
}

/** The newest own link of an Autopilot run in the workspace ("Use … from your latest run"). */
export async function latestRunBookingUrl(db: AnyDb, userId: string, ws: OwnedWorkspace): Promise<string | null> {
  const [row]: any[] = await db
    .select({ bookingUrl: schema.chadGtmRuns.bookingUrl })
    .from(schema.chadGtmRuns)
    .where(
      and(
        eq(schema.chadGtmRuns.userId, userId),
        isNotNull(schema.chadGtmRuns.bookingUrl),
        wsCondition(schema.chadGtmRuns.workspaceId, ws.id, ws.isDefault),
      ),
    )
    .orderBy(desc(schema.chadGtmRuns.createdAt))
    .limit(1);
  return String(row?.bookingUrl ?? "").trim() || null;
}

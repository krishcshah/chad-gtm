import { cookies } from "next/headers";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getDb } from "./db";

export const ACTIVE_WORKSPACE_COOKIE = "sr_active_workspace_id";

export interface WorkspaceItem {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: {
    leadCount: number;
    senderCount: number;
    campaignCount: number;
  };
}

/**
 * Ensures user has at least one default workspace.
 * Automatically migrates any legacy orphaned records to this default workspace.
 */
export async function ensureDefaultWorkspace(userId: string): Promise<WorkspaceItem> {
  const db = getDb();

  // Check if a workspace already exists
  const existing = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, userId))
    .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt)
    .limit(1);

  if (existing.length > 0) {
    return existing[0] as WorkspaceItem;
  }

  // Provision initial default workspace
  const [created] = await db
    .insert(schema.workspaces)
    .values({
      userId,
      name: "Primary Workspace",
      description: "Default workspace for your outreach and client operations",
      isDefault: true,
    })
    .returning();

  // Backfill existing orphaned records so existing user data is seamlessly preserved
  try {
    await Promise.allSettled([
      db
        .update(schema.leadLists)
        .set({ workspaceId: created.id })
        .where(and(eq(schema.leadLists.userId, userId), isNull(schema.leadLists.workspaceId))),
      db
        .update(schema.leads)
        .set({ workspaceId: created.id })
        .where(and(eq(schema.leads.userId, userId), isNull(schema.leads.workspaceId))),
      db
        .update(schema.senderAccounts)
        .set({ workspaceId: created.id })
        .where(and(eq(schema.senderAccounts.userId, userId), isNull(schema.senderAccounts.workspaceId))),
      db
        .update(schema.campaigns)
        .set({ workspaceId: created.id })
        .where(and(eq(schema.campaigns.userId, userId), isNull(schema.campaigns.workspaceId))),
      db
        .update(schema.suppressions)
        .set({ workspaceId: created.id })
        .where(and(eq(schema.suppressions.userId, userId), isNull(schema.suppressions.workspaceId))),
      db
        .update(schema.uniboxMessages)
        .set({ workspaceId: created.id })
        .where(and(eq(schema.uniboxMessages.userId, userId), isNull(schema.uniboxMessages.workspaceId))),
    ]);
  } catch {
    // Non-blocking backfill
  }

  return created as WorkspaceItem;
}

/**
 * Returns the currently active workspace for a user based on cookie,
 * falling back to their default workspace.
 */
export async function getActiveWorkspace(userId: string): Promise<WorkspaceItem> {
  const db = getDb();
  let cookieId: string | undefined;

  try {
    const cookieStore = await cookies();
    cookieId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  } catch {
    // cookies() unavailable in non-request contexts
  }

  if (cookieId) {
    const matched = await db
      .select()
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.id, cookieId), eq(schema.workspaces.userId, userId)))
      .limit(1);

    if (matched.length > 0) {
      return matched[0] as WorkspaceItem;
    }
  }

  // Fallback to user's default workspace
  return ensureDefaultWorkspace(userId);
}

/**
 * Lists all workspaces for the given user with counts for mailboxes, leads, and campaigns.
 */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceItem[]> {
  const db = getDb();

  // Ensure user has at least one workspace
  await ensureDefaultWorkspace(userId);

  const rows = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, userId))
    .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt);

  // Compute stats per workspace
  const workspacesWithStats = await Promise.all(
    rows.map(async (w) => {
      const [leadsRes, sendersRes, campaignsRes] = await Promise.all([
        db
          .select({ total: count() })
          .from(schema.leads)
          .where(and(eq(schema.leads.workspaceId, w.id), isNull(schema.leads.deletedAt))),
        db
          .select({ total: count() })
          .from(schema.senderAccounts)
          .where(and(eq(schema.senderAccounts.workspaceId, w.id), isNull(schema.senderAccounts.deletedAt))),
        db
          .select({ total: count() })
          .from(schema.campaigns)
          .where(and(eq(schema.campaigns.workspaceId, w.id), isNull(schema.campaigns.deletedAt))),
      ]);

      return {
        ...(w as WorkspaceItem),
        stats: {
          leadCount: Number(leadsRes[0]?.total ?? 0),
          senderCount: Number(sendersRes[0]?.total ?? 0),
          campaignCount: Number(campaignResFallback(campaignsRes)),
        },
      };
    })
  );

  return workspacesWithStats;
}

function campaignResFallback(res: { total: number }[]) {
  return res[0]?.total ?? 0;
}

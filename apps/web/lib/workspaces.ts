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

let dbInitialized = false;

/**
 * Idempotently ensures the `workspaces` table and foreign key columns exist in the database.
 * This executes automatically on first access in production without requiring manual CLI migrations.
 */
export async function ensureWorkspacesSchema(): Promise<void> {
  if (dbInitialized) return;
  const db = getDb();
  const stmts = [
    sql`CREATE TABLE IF NOT EXISTS "workspaces" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "name" text NOT NULL,
      "description" text,
      "is_default" boolean DEFAULT false NOT NULL,
      "created_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL,
      "updated_at" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ') NOT NULL
    )`,
    sql`CREATE INDEX IF NOT EXISTS "workspaces_user_idx" ON "workspaces" ("user_id")`,
    sql`ALTER TABLE "lead_lists" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
    sql`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
    sql`ALTER TABLE "sender_accounts" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
    sql`ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
    sql`ALTER TABLE "suppressions" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
    sql`ALTER TABLE "workspace_settings" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
    sql`ALTER TABLE "unibox_messages" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE cascade`,
  ];

  for (const s of stmts) {
    try {
      await db.execute(s);
    } catch {
      // Non-fatal if already exists or concurrent creation
    }
  }
  dbInitialized = true;
}

/**
 * Returns a safe in-memory fallback workspace item if the database is temporarily unreachable.
 */
export function getFallbackWorkspace(userId: string): WorkspaceItem {
  return {
    id: "primary-default",
    userId,
    name: "Primary Workspace",
    description: "Default workspace for your outreach and client operations",
    isDefault: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stats: {
      leadCount: 0,
      senderCount: 0,
      campaignCount: 0,
    },
  };
}

/**
 * Ensures user has at least one default workspace.
 * Automatically migrates any legacy orphaned records to this default workspace.
 */
export async function ensureDefaultWorkspace(userId: string): Promise<WorkspaceItem> {
  const db = getDb();
  await ensureWorkspacesSchema();

  try {
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
  } catch (err) {
    console.error("[ensureDefaultWorkspace] error:", err);
    return getFallbackWorkspace(userId);
  }
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

  if (cookieId && cookieId !== "primary-default") {
    try {
      await ensureWorkspacesSchema();
      const matched = await db
        .select()
        .from(schema.workspaces)
        .where(and(eq(schema.workspaces.id, cookieId), eq(schema.workspaces.userId, userId)))
        .limit(1);

      if (matched.length > 0) {
        return matched[0] as WorkspaceItem;
      }
    } catch (e) {
      // Fallback on error
    }
  }

  // Fallback to user's default workspace
  return ensureDefaultWorkspace(userId);
}

/**
 * Lists all workspaces for the given user with counts for mailboxes, leads, and campaigns.
 */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceItem[]> {
  const defaultWs = await ensureDefaultWorkspace(userId);
  const db = getDb();

  try {
    const rows = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.userId, userId))
      .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt);

    if (!rows.length) {
      return [defaultWs];
    }

    // Compute stats per workspace
    const workspacesWithStats = await Promise.all(
      rows.map(async (w) => {
        try {
          const isDef = w.isDefault || w.id === defaultWs.id;
          const [leadsRes, sendersRes, campaignsRes] = await Promise.all([
            db
              .select({ total: count() })
              .from(schema.leads)
              .where(
                and(
                  eq(schema.leads.userId, userId),
                  isDef
                    ? sql`(${schema.leads.workspaceId} = ${w.id} OR ${schema.leads.workspaceId} IS NULL)`
                    : eq(schema.leads.workspaceId, w.id),
                  isNull(schema.leads.deletedAt)
                )
              ),
            db
              .select({ total: count() })
              .from(schema.senderAccounts)
              .where(
                and(
                  eq(schema.senderAccounts.userId, userId),
                  isDef
                    ? sql`(${schema.senderAccounts.workspaceId} = ${w.id} OR ${schema.senderAccounts.workspaceId} IS NULL)`
                    : eq(schema.senderAccounts.workspaceId, w.id),
                  isNull(schema.senderAccounts.deletedAt)
                )
              ),
            db
              .select({ total: count() })
              .from(schema.campaigns)
              .where(
                and(
                  eq(schema.campaigns.userId, userId),
                  isDef
                    ? sql`(${schema.campaigns.workspaceId} = ${w.id} OR ${schema.campaigns.workspaceId} IS NULL)`
                    : eq(schema.campaigns.workspaceId, w.id),
                  isNull(schema.campaigns.deletedAt)
                )
              ),
          ]);

          return {
            ...(w as WorkspaceItem),
            stats: {
              leadCount: Number(leadsRes[0]?.total ?? 0),
              senderCount: Number(sendersRes[0]?.total ?? 0),
              campaignCount: Number(campaignResFallback(campaignsRes)),
            },
          };
        } catch {
          return w as WorkspaceItem;
        }
      })
    );

    return workspacesWithStats;
  } catch (err) {
    console.error("[listUserWorkspaces] error:", err);
    return [defaultWs];
  }
}

function campaignResFallback(res: { total: number }[]) {
  return res[0]?.total ?? 0;
}

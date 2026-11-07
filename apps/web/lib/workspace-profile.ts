/**
 * Per-workspace sender identity (company name, postal address) for the web
 * app. Reads go through the shared loader the engine uses, so Settings, the
 * postal-address hold and the email footer always agree.
 *
 * Deliberately NOT a "use server" module: these take a trusted user id and
 * are only called from server components and server actions.
 */
import { and, eq } from "drizzle-orm";
import { loadWorkspaceProfile, schema, type WorkspaceProfile } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb } from "./db";
import { ensureDefaultWorkspace } from "./workspaces";

export type { WorkspaceProfile };

/** The workspace's sender profile (null / 'primary-default' = the user's default workspace). */
export async function getWorkspaceProfile(userId: string, workspaceId: string | null): Promise<WorkspaceProfile> {
  return loadWorkspaceProfile(getDb(), { userId, workspaceId });
}

/**
 * Save the sender identity on one workspace row of the user (null = their
 * default workspace). Never writes the legacy workspace_settings row.
 * Returns whether a row was updated.
 */
export async function writeWorkspaceIdentity(
  db: any,
  userId: string,
  workspaceId: string | null,
  identity: { companyName: string; postalAddress: string },
): Promise<boolean> {
  const id = workspaceId && workspaceId !== "primary-default" ? workspaceId : (await ensureDefaultWorkspace(userId)).id;
  if (!id || id === "primary-default") return false;
  const updated: Array<{ id: string }> = await db
    .update(schema.workspaces)
    .set({ companyName: identity.companyName, postalAddress: identity.postalAddress, updatedAt: nowIso() })
    .where(and(eq(schema.workspaces.id, id), eq(schema.workspaces.userId, userId)))
    .returning({ id: schema.workspaces.id });
  return updated.length > 0;
}

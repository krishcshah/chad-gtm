/**
 * Who gets a workspace's "Needs you" notices, and which ones
 * (Settings › Lead conversations › Notifications).
 *
 *   notify_email        '' means the account's login email
 *   notify_escalations  email when a lead needs you
 *   notify_reminders    daily reminder about unanswered requests
 *
 * These notices are only ever sent by the system mailer, never from a
 * cold-outreach pool mailbox. Without one they stay in the app (Needs you).
 */
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import type { EngineDb } from "./db-port";

export interface WorkspaceNotifyProfile {
  workspaceId: string | null;
  /** '' means the login email. */
  notifyEmail: string;
  notifyEscalations: boolean;
  notifyReminders: boolean;
}

export const DEFAULT_NOTIFY_PROFILE: WorkspaceNotifyProfile = {
  workspaceId: null,
  notifyEmail: "",
  notifyEscalations: true,
  notifyReminders: true,
};

const COLUMNS = {
  id: schema.workspaces.id,
  notifyEmail: schema.workspaces.notifyEmail,
  notifyEscalations: schema.workspaces.notifyEscalations,
  notifyReminders: schema.workspaces.notifyReminders,
};

/**
 * Notification settings of `workspaceId` (owned by the user), else of the
 * user's default (or oldest) workspace. No row means the defaults: both
 * notices on, sent to the login email.
 */
export async function loadWorkspaceProfile(
  db: EngineDb,
  input: { userId: string; workspaceId?: string | null },
): Promise<WorkspaceNotifyProfile> {
  const [row]: any[] = input.workspaceId
    ? await db
        .select(COLUMNS)
        .from(schema.workspaces)
        .where(and(eq(schema.workspaces.id, input.workspaceId), eq(schema.workspaces.userId, input.userId)))
        .limit(1)
    : await db
        .select(COLUMNS)
        .from(schema.workspaces)
        .where(eq(schema.workspaces.userId, input.userId))
        .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt)
        .limit(1);
  if (!row) return DEFAULT_NOTIFY_PROFILE;
  return {
    workspaceId: row.id ?? null,
    notifyEmail: typeof row.notifyEmail === "string" ? row.notifyEmail.trim() : "",
    notifyEscalations: row.notifyEscalations !== false,
    notifyReminders: row.notifyReminders !== false,
  };
}

/** Where this workspace's notices go: its notify address, else the login email. */
export function notificationRecipient(profile: Pick<WorkspaceNotifyProfile, "notifyEmail">, loginEmail: string): string {
  return profile.notifyEmail.trim() || loginEmail;
}

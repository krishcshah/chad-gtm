/**
 * The sender profile of one workspace: company name and postal address (the
 * CAN-SPAM footer), default booking link and where notices go.
 *
 * One loader shared by the web app and the email engine, so a footer, the
 * postal-address hold and Settings always read the same row.
 *
 * Resolution:
 *  - a workspace id: that workspace of the user, or an EMPTY profile when it
 *    is not theirs / gone (never another workspace's row: the blank postal
 *    address then holds the sends, which is the safe outcome);
 *  - null or 'primary-default': the user's default (else oldest) workspace;
 *  - the user has no workspace rows at all: the legacy account row
 *    (workspace_settings), company name and postal address only.
 */
import { and, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

export interface WorkspaceProfile {
  /** The workspace that was resolved; null for the legacy row or nothing found. */
  workspaceId: string | null;
  workspaceName: string;
  isDefault: boolean;
  companyName: string;
  postalAddress: string;
  bookingUrl: string | null;
  /** '' = the account's login email. */
  notifyEmail: string;
  notifyEscalations: boolean;
  notifyReminders: boolean;
  source: "workspace" | "legacy" | "none";
}

const EMPTY_PROFILE: WorkspaceProfile = {
  workspaceId: null,
  workspaceName: "",
  isDefault: false,
  companyName: "",
  postalAddress: "",
  bookingUrl: null,
  notifyEmail: "",
  notifyEscalations: true,
  notifyReminders: true,
  source: "none",
};

export function emptyWorkspaceProfile(): WorkspaceProfile {
  return { ...EMPTY_PROFILE };
}

const str = (v: unknown): string => String(v ?? "").trim();

function fromWorkspaceRow(row: Record<string, unknown>): WorkspaceProfile {
  return {
    workspaceId: row.id ? String(row.id) : null,
    workspaceName: str(row.workspaceName),
    isDefault: row.isDefault === true,
    companyName: str(row.companyName),
    postalAddress: str(row.postalAddress),
    bookingUrl: str(row.bookingUrl) || null,
    notifyEmail: str(row.notifyEmail),
    // Only an explicit false switches a notice off.
    notifyEscalations: row.notifyEscalations !== false,
    notifyReminders: row.notifyReminders !== false,
    source: "workspace",
  };
}

/** Load the sender profile for `workspaceId` (see the rules above). Never widens to another workspace. */
export async function loadWorkspaceProfile(
  db: any,
  input: { userId: string; workspaceId: string | null | undefined },
): Promise<WorkspaceProfile> {
  const cols = {
    id: schema.workspaces.id,
    workspaceName: schema.workspaces.name,
    isDefault: schema.workspaces.isDefault,
    companyName: schema.workspaces.companyName,
    postalAddress: schema.workspaces.postalAddress,
    bookingUrl: schema.workspaces.bookingUrl,
    notifyEmail: schema.workspaces.notifyEmail,
    notifyEscalations: schema.workspaces.notifyEscalations,
    notifyReminders: schema.workspaces.notifyReminders,
  };
  const workspaceId = input.workspaceId && input.workspaceId !== "primary-default" ? input.workspaceId : null;

  if (workspaceId) {
    const rows: Record<string, unknown>[] = await db
      .select(cols)
      .from(schema.workspaces)
      .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, input.userId)))
      .limit(1);
    // Not this user's workspace (or deleted): blank, so the sender is held.
    return rows[0] ? fromWorkspaceRow(rows[0]) : emptyWorkspaceProfile();
  }

  const rows: Record<string, unknown>[] = await db
    .select(cols)
    .from(schema.workspaces)
    .where(eq(schema.workspaces.userId, input.userId))
    .orderBy(desc(schema.workspaces.isDefault), schema.workspaces.createdAt)
    .limit(1);
  if (rows[0]) return fromWorkspaceRow(rows[0]);

  // No workspace rows at all: the legacy account-wide identity.
  const legacy: Record<string, unknown>[] = await db
    .select({
      companyName: schema.workspaceSettings.companyName,
      postalAddress: schema.workspaceSettings.postalAddress,
    })
    .from(schema.workspaceSettings)
    .where(eq(schema.workspaceSettings.userId, input.userId))
    .limit(1);
  if (!legacy[0]) return emptyWorkspaceProfile();
  return {
    ...emptyWorkspaceProfile(),
    companyName: str(legacy[0].companyName),
    postalAddress: str(legacy[0].postalAddress),
    source: "legacy",
  };
}

/** The booking link an Autopilot run uses: its own, else the workspace default, else none. */
export function effectiveBookingUrl(
  runBookingUrl: string | null | undefined,
  profile: Pick<WorkspaceProfile, "bookingUrl"> | null | undefined,
): string | null {
  return str(runBookingUrl) || str(profile?.bookingUrl) || null;
}

/** Where "Needs you" notices go: the workspace's notify address, else the owner's login email. */
export function notificationRecipient(profile: Pick<WorkspaceProfile, "notifyEmail"> | null | undefined, ownerEmail: string): string {
  return str(profile?.notifyEmail) || ownerEmail;
}

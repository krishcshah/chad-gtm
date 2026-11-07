"use server";

/**
 * Per-workspace settings saved one at a time from Settings › Lead conversations.
 *
 *  saveWorkspaceBookingUrlAction   the workspace booking link (Autopilot runs without their own use it)
 *  getNotificationSettingsAction,  where "Needs you" emails go and which are sent (notify_email,
 *  saveNotificationSettingsAction  notify_escalations, notify_reminders; '' = the login email)
 *  saveSenderIdentityAction        company name and postal address (Settings › Compliance, #72)
 */
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb } from "./db";
import { requireUser } from "./session";
import { normalizeClientBookingUrl } from "./booking-links";
import { loadOwnedWorkspace, saveWorkspaceBookingUrl } from "./workspace-booking";
import { workspaceSettingsSchema } from "@smartreach/validation";
import { formatZodActionError } from "./zod-action-error";
import { writeWorkspaceIdentity } from "./workspace-profile";

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

const BAD_BOOKING_LINK = "Paste a full booking link, e.g. https://cal.com/you/intro";

/** Save the workspace booking link; an empty link clears the default. */
export async function saveWorkspaceBookingUrlAction(input: {
  workspaceId: string;
  bookingUrl: string;
}): Promise<Result<{ bookingUrl: string | null; answered: number }>> {
  const user = await requireUser();
  const raw = String(input?.bookingUrl ?? "").trim();
  const bookingUrl = raw ? normalizeClientBookingUrl(raw) : null;
  if (raw && !bookingUrl) return { ok: false, error: BAD_BOOKING_LINK };

  const db = getDb();
  // Only the owner's workspace: an id from someone else is "not found".
  const workspace = await loadOwnedWorkspace(db, user.id, String(input?.workspaceId ?? "") || null);
  if (!workspace || (input?.workspaceId && workspace.id !== input.workspaceId)) {
    return { ok: false, error: "Workspace not found." };
  }

  const { saved, answered } = await saveWorkspaceBookingUrl(db, { userId: user.id, workspace, bookingUrl, nowIso: nowIso() });
  if (!saved) return { ok: false, error: "Workspace not found." };
  revalidatePath("/settings");
  revalidatePath("/chad-gtm");
  revalidatePath("/requests");
  const message = !bookingUrl
    ? "Booking link removed. Runs without their own link have none now."
    : answered > 0
      ? `Booking link saved. The agent will answer ${answered} ${answered === 1 ? "lead" : "leads"} waiting for one.`
      : "Booking link saved.";
  return { ok: true, data: { bookingUrl, answered }, message };
}

/* ─── Notifications ───────────────────────────────────────────────────── */

const notificationSettingsSchema = z.object({
  workspaceId: z.string().trim().min(1),
  notifyEmail: z.string().trim().max(320).email().or(z.literal("")),
  notifyEscalations: z.boolean(),
  notifyReminders: z.boolean(),
});

export interface NotificationSettingsView {
  notifyEmail: string;
  notifyEscalations: boolean;
  notifyReminders: boolean;
  /** Where the emails go now: the notify address, else the login email. */
  notifyTo: string;
}

/** The workspace's Notifications settings (defaults when it has no row yet). */
export async function getNotificationSettingsAction(workspaceId: string | null): Promise<Result<NotificationSettingsView>> {
  const user = await requireUser();
  const [row] = workspaceId
    ? await getDb()
        .select({
          notifyEmail: schema.workspaces.notifyEmail,
          notifyEscalations: schema.workspaces.notifyEscalations,
          notifyReminders: schema.workspaces.notifyReminders,
        })
        .from(schema.workspaces)
        .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, user.id)))
        .limit(1)
    : [];
  const notifyEmail = String(row?.notifyEmail ?? "").trim();
  return {
    ok: true,
    data: {
      notifyEmail,
      notifyEscalations: row?.notifyEscalations !== false,
      notifyReminders: row?.notifyReminders !== false,
      notifyTo: notifyEmail || user.email,
    },
  };
}

/** Save where "Needs you" emails go and which are sent. Only the workspace's owner can. */
export async function saveNotificationSettingsAction(input: {
  workspaceId: string;
  notifyEmail: string;
  notifyEscalations: boolean;
  notifyReminders: boolean;
}): Promise<Result<NotificationSettingsView>> {
  const user = await requireUser();
  const parsed = notificationSettingsSchema.safeParse({
    ...input,
    notifyEmail: String(input?.notifyEmail ?? "").trim(),
  });
  if (!parsed.success) {
    const emailIssue = parsed.error.issues.some((i) => i.path[0] === "notifyEmail");
    return {
      ok: false,
      error: emailIssue
        ? "Enter a valid email address, or leave it empty to use your login email."
        : "Create a workspace first, then save these settings.",
    };
  }
  const { workspaceId, notifyEmail, notifyEscalations, notifyReminders } = parsed.data;

  // Conditional on the owner: an id from someone else is "not found".
  const saved: Array<{ id: string }> = await getDb()
    .update(schema.workspaces)
    .set({ notifyEmail, notifyEscalations, notifyReminders, updatedAt: nowIso() })
    .where(and(eq(schema.workspaces.id, workspaceId), eq(schema.workspaces.userId, user.id)))
    .returning({ id: schema.workspaces.id });
  if (saved.length === 0) return { ok: false, error: "Workspace not found." };

  revalidatePath("/settings");
  return {
    ok: true,
    data: { notifyEmail, notifyEscalations, notifyReminders, notifyTo: notifyEmail || user.email },
    message: "Notification settings saved.",
  };
}

/* ─── Sender details (Settings › Compliance) ─────────────────────────── */

/**
 * Save the company name and postal address of one workspace (#72). They go
 * in the footer of that workspace's campaign emails only. Only the owner's
 * workspace; the legacy account row is never written.
 */
export async function saveSenderIdentityAction(input: {
  workspaceId: string;
  companyName: string;
  postalAddress: string;
}): Promise<
  | { ok: true; message: string; data: { companyName: string; postalAddress: string } }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
> {
  const user = await requireUser();
  // unsubscribeBaseUrl is not passed: the unsubscribe link always points at AutoGTM.
  const parsed = workspaceSettingsSchema.safeParse({
    companyName: input?.companyName ?? "",
    postalAddress: input?.postalAddress ?? "",
  });
  if (!parsed.success) {
    const { error, fieldErrors } = formatZodActionError(parsed.error.issues);
    return { ok: false, error, fieldErrors };
  }

  const db = getDb();
  const requested = String(input?.workspaceId ?? "").trim() || null;
  const workspace = await loadOwnedWorkspace(db, user.id, requested);
  if (!workspace || (requested && requested !== "primary-default" && workspace.id !== requested)) {
    return { ok: false, error: "Workspace not found." };
  }

  const { companyName, postalAddress } = parsed.data;
  const saved = await writeWorkspaceIdentity(db, user.id, workspace.id, { companyName, postalAddress });
  if (!saved) return { ok: false, error: "Workspace not found." };

  for (const path of ["/settings", "/dashboard", "/campaigns", "/chad-gtm"]) revalidatePath(path);
  return {
    ok: true,
    data: { companyName, postalAddress },
    message: `Sender details saved for ${workspace.name || "this workspace"}`,
  };
}

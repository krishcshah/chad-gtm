/**
 * Sender operations: pause/resume, edit limits, update details, delete.
 * (AutoGTM runs no mailbox warm-up; see sender-warmup.ts.)
 */
import { and, eq } from "drizzle-orm";
import { schema, encryptSecret } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { hasWarmupMarker, stripWarmupMarker } from "./sender-warmup";
import { patchChangesCredentials, poolActivationBlocker } from "./pool-mailbox-import";
import { senderEndpointPatchError } from "./mail-host-guard";

const { senderAccounts } = schema;

export type SenderActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

/** Pause (pause=true) or resume (pause=false) an owned sender (P04). */
export async function toggleSenderForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  senderId: string,
  pause: boolean,
): Promise<SenderActionResult> {
  try {
    if (!pause) {
      const [current] = await db
        .select({
          isSystemPool: senderAccounts.isSystemPool,
          smtpStatus: senderAccounts.smtpStatus,
          imapStatus: senderAccounts.imapStatus,
        })
        .from(senderAccounts)
        .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)))
        .limit(1);
      if (!current) return { ok: false, error: "Sender not found" };
      const blocked = poolActivationBlocker(current);
      if (blocked) return { ok: false, error: blocked };
    }
    const [row] = await db
      .update(senderAccounts)
      .set({ status: pause ? "paused" : "active", updatedAt: nowIso() })
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)))
      .returning({ id: senderAccounts.id });
    if (!row) return { ok: false, error: "Sender not found" };
    return { ok: true, message: pause ? "Sender paused" : "Sender resumed" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Soft-delete an owned sender mailbox. */
export async function deleteSenderForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  senderId: string,
): Promise<SenderActionResult> {
  try {
    const [row] = await db
      .update(senderAccounts)
      .set({ deletedAt: nowIso(), updatedAt: nowIso() })
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)))
      .returning({ id: senderAccounts.id });
    if (!row) return { ok: false, error: "Sender not found" };
    return { ok: true, message: "Sender deleted successfully" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete sender" };
  }
}

/** Quick-update daily and hourly limits for a sender. */
export async function updateSenderLimitsForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  senderId: string,
  dailyLimit: number,
  hourlyLimit?: number,
): Promise<SenderActionResult> {
  try {
    const safeDaily = Math.max(1, Math.min(2000, Number(dailyLimit) || 50));
    const safeHourly = Math.max(1, Math.min(200, Number(hourlyLimit ?? Math.ceil(safeDaily / 4))));

    const [row] = await db
      .update(senderAccounts)
      .set({ dailyLimit: safeDaily, hourlyLimit: safeHourly, updatedAt: nowIso() })
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)))
      .returning({ id: senderAccounts.id });
    if (!row) return { ok: false, error: "Sender not found" };
    return { ok: true, message: `Daily sending limit updated to ${safeDaily}/day` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update limits" };
  }
}

/** Update general details for a sender. */
export async function updateSenderDetailsForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  senderId: string,
  data: {
    senderName?: string;
    fromName?: string;
    replyTo?: string;
    dailyLimit?: number;
    hourlyLimit?: number;
    timezone?: string;
    cleanSignature?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUsername?: string;
    smtpPassword?: string;
    smtpSecurity?: "tls" | "ssl" | "none";
    imapHost?: string;
    imapPort?: number;
    imapUsername?: string;
    imapPassword?: string;
  },
): Promise<SenderActionResult> {
  try {
    const [sender] = await db
      .select()
      .from(senderAccounts)
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)))
      .limit(1);
    if (!sender) return { ok: false, error: "Sender not found" };

    const patch: Record<string, unknown> = {
      updatedAt: nowIso(),
    };
    // Never store the old warm-up marker: it was sent out with the signature.
    if (data.cleanSignature !== undefined) {
      patch.signature = stripWarmupMarker(data.cleanSignature);
    } else if (hasWarmupMarker(sender.signature)) {
      patch.signature = stripWarmupMarker(sender.signature);
    }

    if (data.senderName) patch.senderName = data.senderName.trim();
    if (data.fromName !== undefined) patch.fromName = data.fromName.trim();
    if (data.replyTo !== undefined) patch.replyTo = data.replyTo.trim();
    if (data.dailyLimit !== undefined) patch.dailyLimit = Math.max(1, Number(data.dailyLimit));
    if (data.hourlyLimit !== undefined) patch.hourlyLimit = Math.max(1, Number(data.hourlyLimit));
    if (data.timezone) patch.timezone = data.timezone;

    // SMTP Credential Updates
    if (data.smtpHost !== undefined && data.smtpHost.trim() !== "") {
      patch.smtpHost = data.smtpHost.trim();
    }
    if (data.smtpPort !== undefined && !isNaN(Number(data.smtpPort))) {
      patch.smtpPort = Number(data.smtpPort);
    }
    if (data.smtpUsername !== undefined && data.smtpUsername.trim() !== "") {
      patch.smtpUsername = data.smtpUsername.trim();
    }
    if (data.smtpPassword !== undefined && data.smtpPassword.trim() !== "") {
      patch.smtpPasswordEnc = encryptSecret(data.smtpPassword.trim());
    }
    if (data.smtpSecurity !== undefined) {
      patch.smtpSecurity = data.smtpSecurity;
    }

    // IMAP Credential Updates
    if (data.imapHost !== undefined) {
      patch.imapHost = data.imapHost.trim();
    }
    if (data.imapPort !== undefined && !isNaN(Number(data.imapPort))) {
      patch.imapPort = Number(data.imapPort);
    }
    if (data.imapUsername !== undefined) {
      patch.imapUsername = data.imapUsername.trim();
    }
    if (data.imapPassword !== undefined && data.imapPassword.trim() !== "") {
      patch.imapPasswordEnc = encryptSecret(data.imapPassword.trim());
    }

    // Only public mail servers on mail ports (the server action also resolves new hosts).
    const changed = (key: "smtpHost" | "smtpPort" | "imapHost" | "imapPort") =>
      patch[key] !== undefined && patch[key] !== sender[key] ? patch[key] : undefined;
    const endpointError = senderEndpointPatchError({
      smtpHost: changed("smtpHost"),
      smtpPort: changed("smtpPort"),
      imapHost: changed("imapHost"),
      imapPort: changed("imapPort"),
    });
    if (endpointError) return { ok: false, error: endpointError };

    // A shared pool mailbox with new login details must pass a new test before it sends again.
    const needsRetest = Boolean(sender.isSystemPool) && patchChangesCredentials(patch);
    if (needsRetest) {
      patch.smtpStatus = "untested";
      patch.imapStatus = "untested";
      patch.status = "paused";
    }

    await db
      .update(senderAccounts)
      .set(patch)
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)));

    return {
      ok: true,
      message: needsRetest
        ? "Saved. This shared mailbox is paused until Retest Connection passes."
        : "Sender details saved successfully",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update sender" };
  }
}

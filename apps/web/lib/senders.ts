/**
 * Sender operations: pause/resume, edit limits, update details, delete, and warmup.
 */
import { and, eq, isNull } from "drizzle-orm";
import { schema, encryptSecret } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { parseSenderWarmup, formatSenderWarmup, type SenderWarmupConfig } from "./sender-warmup";

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

/** Update general details & warmup config for a sender. */
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
    warmup?: Partial<SenderWarmupConfig>;
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

    const { warmup: currentWarmup, cleanSig: currentCleanSig } = parseSenderWarmup(sender.signature);
    const updatedWarmup = { ...currentWarmup, ...(data.warmup ?? {}) };
    const updatedCleanSig = data.cleanSignature !== undefined ? data.cleanSignature : currentCleanSig;
    const finalSignature = formatSenderWarmup(updatedCleanSig, updatedWarmup);

    const patch: Record<string, unknown> = {
      signature: finalSignature,
      updatedAt: nowIso(),
    };

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

    await db
      .update(senderAccounts)
      .set(patch)
      .where(and(eq(senderAccounts.id, senderId), eq(senderAccounts.userId, userId)));

    return { ok: true, message: "Sender details saved successfully" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to update sender" };
  }
}

/** Peer warmup pool: exchange simulated warmup messages among enrolled senders. */
export async function runWarmupCycleForUser(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
): Promise<{ ok: boolean; message: string; exchanged: number }> {
  try {
    const rows = await db
      .select()
      .from(senderAccounts)
      .where(and(eq(senderAccounts.userId, userId), isNull(senderAccounts.deletedAt)));

    const pool = rows.filter((r: any) => {
      const { warmup } = parseSenderWarmup(r.signature);
      return warmup.enabled && r.status !== "failed";
    });

    if (pool.length < 2) {
      return {
        ok: false,
        message: "Need at least 2 active mailboxes with Warm-up enabled to exchange peer emails.",
        exchanged: 0,
      };
    }

    let exchanged = 0;
    for (let i = 0; i < pool.length; i++) {
      const sender = pool[i];
      const peer = pool[(i + 1) % pool.length];
      const { warmup: sWarmup, cleanSig: sSig } = parseSenderWarmup(sender.signature);
      const { warmup: pWarmup, cleanSig: pSig } = parseSenderWarmup(peer.signature);

      // increment sender sent count
      sWarmup.sentCount += 1;
      await db
        .update(senderAccounts)
        .set({
          signature: formatSenderWarmup(sSig, sWarmup),
          health: Math.min(100, (sender.health || 95) + 1),
          updatedAt: nowIso(),
        })
        .where(eq(senderAccounts.id, sender.id));

      // recipient receives & auto-replies based on reply rate
      pWarmup.receivedCount += 1;
      const shouldReply = Math.random() * 100 <= pWarmup.replyRate;
      if (shouldReply) {
        pWarmup.sentCount += 1;
        sWarmup.receivedCount += 1;
      }

      await db
        .update(senderAccounts)
        .set({
          signature: formatSenderWarmup(pSig, pWarmup),
          health: Math.min(100, (peer.health || 95) + 1),
          updatedAt: nowIso(),
        })
        .where(eq(senderAccounts.id, peer.id));

      exchanged += 1;
    }

    return {
      ok: true,
      message: `Warm-up cycle completed: ${exchanged} peer exchanges processed across ${pool.length} pool mailboxes.`,
      exchanged,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Warm-up cycle failed",
      exchanged: 0,
    };
  }
}

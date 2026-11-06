/**
 * Processor — the only place that touches the network for sending.
 *
 * Claims due jobs atomically (pending → processing with a conditional update
 * on scheduleFor so two workers can't double-send), sends via SMTP through
 * the assigned sender, records usage counters, handles automatic retries with
 * backoff, and recovers jobs stuck in "processing" after a crash.
 */
import {
  applyComplianceFooter,
  buildUnsubscribeApiUrl,
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  listUnsubscribeHeaders,
  schema,
} from "@smartreach/database";
import { addSeconds, randomBetween } from "@smartreach/shared";
import { and, asc, eq, lte } from "drizzle-orm";
import type { EngineDb, JobRow, SenderRow } from "./db-port";
import { makeTransport } from "./mailer";
import {
  noteHourlySend,
  recordSend,
  releaseSendSlot,
  reserveSendSlot,
  senderDailyCap,
} from "./rotation";
import { isEngineDryRun, workerOwnsJob } from "./queue-mode";
import { advanceSequenceAfterSend, loadCampaignSequenceSteps } from "./sequence";
import { appUrl, appUrlReadyForLiveSend, engineBatchSize } from "./env";
import { isSuppressedFor } from "./suppression";
import { classifySmtpError, failureBlamesSender } from "./smtp-errors";
import { completeBodies } from "./body-format";
import { recordHardBounce } from "./bounces";

const STUCK_AFTER_MS = 3 * 60_000;
/** How long a job waits when it cannot legally go out yet (no postal address / APP_URL). */
const HOLD_SEC = 3600;

export const POSTAL_ADDRESS_HOLD_REASON =
  "Held: add your business postal address in Settings. Every cold email must show it (CAN-SPAM).";
export const APP_URL_HOLD_REASON =
  "Held: the engine has no public APP_URL, so the unsubscribe link would not work.";

export interface ProcessResult {
  sent: number;
  failed: number;
  retried: number;
  recovered: number;
  skipped: number;
  /** Jobs held back because they could not legally go out yet. */
  held: number;
}

export function injectEmailTracking(
  html: string,
  jobId: string,
  baseUrl: string,
  options?: { trackOpens?: boolean }
): string {
  if (!html) return html;
  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const trackOpens = options?.trackOpens ?? true;

  // Rewrite standard web links for click tracking (ignore mailto:, tel:, #, and already tracked links)
  const trackedHtml = html.replace(
    /<a\b([^>]*?)href=(["'])(https?:\/\/[^"'\s>]+)\2([^>]*)>/gi,
    (match, prefix, quote, originalUrl, suffix) => {
      // Never wrap our own tracking or unsubscribe links: the opt-out must
      // work directly, without a redirect through the click tracker.
      if (originalUrl.includes("/api/track/") || /\/(?:api\/)?unsubscribe\b/i.test(originalUrl)) {
        return match;
      }
      const trackingUrl = `${cleanBaseUrl}/api/track/click?jid=${encodeURIComponent(jobId)}&url=${encodeURIComponent(originalUrl)}`;
      return `<a${prefix}href=${quote}${trackingUrl}${quote}${suffix}>`;
    }
  );

  // If open tracking is disabled for this campaign, return HTML with only click tracking
  if (!trackOpens) {
    return trackedHtml;
  }

  // Append 1x1 transparent open pixel
  const openPixel = `<img src="${cleanBaseUrl}/api/track/open?jid=${encodeURIComponent(jobId)}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;" />`;

  if (/<\/body>/i.test(trackedHtml)) {
    return trackedHtml.replace(/<\/body>/i, `${openPixel}</body>`);
  }
  return `${trackedHtml}\n${openPixel}`;
}

/** Claim due jobs: conditional CAS update makes it safe across overlapping workers. */
export async function claimDueJobs(db: EngineDb, now = new Date(), limit = engineBatchSize()): Promise<JobRow[]> {
  const dryRun = isEngineDryRun();
  const due: JobRow[] = await db
    .select()
    .from(schema.emailJobs)
    .where(
      and(
        eq(schema.emailJobs.status, "pending"),
        lte(schema.emailJobs.scheduledFor, now.toISOString()),
        eq(schema.emailJobs.dryRun, dryRun),
      ),
    )
    .orderBy(asc(schema.emailJobs.scheduledFor))
    .limit(limit);
  // Belt-and-suspenders: never claim the other mode even if SQL filter is absent (tests / old DBs).
  const owned = due.filter((j) => workerOwnsJob(Boolean(j.dryRun), dryRun));
  const claimed: JobRow[] = [];
  for (const job of owned) {
    const res: { id: string }[] = await db
      .update(schema.emailJobs)
      .set({ status: "processing", processingAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(schema.emailJobs.id, job.id), eq(schema.emailJobs.status, "pending")))
      .returning({ id: schema.emailJobs.id });
    if (res.length > 0) claimed.push({ ...job, status: "processing" });
  }
  return claimed;
}

/** Re-queue jobs that have been "processing" for too long (worker died mid-send). */
export async function recoverStuckJobs(db: EngineDb, now = new Date()): Promise<number> {
  const dryRun = isEngineDryRun();
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();
  const stuck: { id: string }[] = await db
    .select({ id: schema.emailJobs.id })
    .from(schema.emailJobs)
    .where(
      and(
        eq(schema.emailJobs.status, "processing"),
        lte(schema.emailJobs.processingAt, cutoff),
        eq(schema.emailJobs.dryRun, dryRun),
      ),
    )
    .limit(200);
  for (const s of stuck) {
    await db
      .update(schema.emailJobs)
      .set({ status: "pending", processingAt: null, updatedAt: now.toISOString() })
      .where(and(eq(schema.emailJobs.id, s.id), eq(schema.emailJobs.status, "processing")));
  }
  return stuck.length;
}

export type JobOutcome = "sent" | "retry" | "failed" | "skipped" | "held";

/**
 * Final bodies for a cold sequence email: both parts filled in, then the
 * compliance footer (company, postal address, unsubscribe link) on each.
 * Pure — the processor adds tracking to the HTML afterwards.
 */
export function buildOutgoingBodies(input: {
  text: string;
  html: string;
  companyName: string;
  postalAddress: string;
  unsubUrl: string;
}): { text: string; html: string } {
  const parts = completeBodies(input.text, input.html);
  return applyComplianceFooter(parts, {
    companyName: input.companyName,
    postalAddress: input.postalAddress,
    unsubUrl: input.unsubUrl,
  });
}

/** Sender identity for the footer: workspace settings, else the autopilot run. */
async function loadComplianceInfo(
  db: EngineDb,
  campaign: { id: string; userId: string },
): Promise<{ companyName: string; postalAddress: string }> {
  const settingsRows: { companyName?: string; postalAddress?: string }[] = await db
    .select({
      companyName: schema.workspaceSettings.companyName,
      postalAddress: schema.workspaceSettings.postalAddress,
    })
    .from(schema.workspaceSettings)
    .where(eq(schema.workspaceSettings.userId, campaign.userId))
    .limit(1);
  const postalAddress = String(settingsRows[0]?.postalAddress ?? "").trim();
  let companyName = String(settingsRows[0]?.companyName ?? "").trim();
  if (!companyName) {
    const runs: { companyName?: string }[] = await db
      .select({ companyName: schema.chadGtmRuns.companyName })
      .from(schema.chadGtmRuns)
      .where(eq(schema.chadGtmRuns.campaignId, campaign.id))
      .limit(1);
    companyName = String(runs[0]?.companyName ?? "").trim();
  }
  return { companyName, postalAddress };
}

/** Put the job back in the queue with a visible reason (nothing is sent). */
async function holdJob(db: EngineDb, job: JobRow, reason: string, seconds = HOLD_SEC): Promise<void> {
  const nowS = new Date().toISOString();
  await db
    .update(schema.emailJobs)
    .set({
      status: "pending",
      scheduledFor: addSeconds(new Date(), seconds).toISOString(),
      processingAt: null,
      lastError: reason,
      updatedAt: nowS,
    })
    .where(eq(schema.emailJobs.id, job.id));
}

/**
 * The job's mailbox is gone or disabled: drop the unsent job and hand the
 * lead back to the scheduler, which re-renders it for another mailbox (the
 * sticky-sender rule allows a switch only in this case).
 */
async function releaseToScheduler(db: EngineDb, job: JobRow, reason: string): Promise<void> {
  const nowS = new Date().toISOString();
  const deleted: { id: string }[] = await db
    .delete(schema.emailJobs)
    .where(and(eq(schema.emailJobs.id, job.id), eq(schema.emailJobs.status, "processing")))
    .returning({ id: schema.emailJobs.id });
  if (deleted.length === 0) return;
  await db
    .update(schema.campaignLeads)
    .set({ status: "queued", scheduledFor: nowS, lastError: reason, updatedAt: nowS })
    .where(and(eq(schema.campaignLeads.id, job.campaignLeadId), eq(schema.campaignLeads.status, "scheduled")));
}

const UNSENDABLE_LEAD_STATUSES = new Set(["bounced", "unsubscribed", "blocked"]);

export async function processJob(db: EngineDb, job: JobRow): Promise<JobOutcome> {
  const nowS = new Date().toISOString();

  // Load sender + campaign (fresh, to honor just-paused states)
  const senders: SenderRow[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, job.senderId))
    .limit(1);
  const sender = senders[0];
  const campaigns = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, job.campaignId)).limit(1);
  const campaign = campaigns[0];

  // Campaign paused/archived mid-flight → put the job back
  if (!campaign || !["running", "scheduled"].includes(campaign.status)) {
    await db
      .update(schema.emailJobs)
      .set({ status: "pending", processingAt: null, updatedAt: nowS })
      .where(eq(schema.emailJobs.id, job.id));
    return "skipped";
  }
  // Lead replied, bounced, opted out (or was deleted) since scheduling → cancel
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.id, job.leadId)).limit(1);
  const lead = leads[0];
  if (
    !lead ||
    lead.deletedAt ||
    UNSENDABLE_LEAD_STATUSES.has(String(lead.status)) ||
    (campaign.stopOnReply && lead.status === "replied")
  ) {
    await cancelJobChain(db, job, "lead-no-longer-sendable");
    return "skipped";
  }

  // F15: re-check suppression at send time — this user's list plus global
  // opt-outs (unsubscribe / bounce / complaint) recorded under any user.
  if (await isSuppressedFor(db, campaign.userId, job.toEmail)) {
    await cancelJobChain(db, job, "suppressed");
    return "skipped";
  }

  // Mailbox gone or disabled since scheduling → back to the scheduler
  if (!sender || sender.status !== "active") {
    await releaseToScheduler(db, job, "sender-unavailable");
    return "skipped";
  }

  // Compliance: no postal address → nothing goes out.
  const compliance = await loadComplianceInfo(db, campaign);
  if (!compliance.postalAddress) {
    await holdJob(db, job, POSTAL_ADDRESS_HOLD_REASON);
    return "held";
  }
  const dryRun = isEngineDryRun();
  if (!dryRun && !appUrlReadyForLiveSend()) {
    console.error(`[processor] ${APP_URL_HOLD_REASON} Set APP_URL (e.g. https://autogtm.tech) and restart.`);
    await holdJob(db, job, APP_URL_HOLD_REASON, 600);
    return "held";
  }

  let reserved = false;

  try {
    // Links are built now (not at import time) from the configured APP_URL.
    const baseUrl = appUrl();
    const unsubToken = createUnsubscribeToken(campaign.userId, job.toEmail);
    const unsubPageUrl = buildUnsubscribeUrl(baseUrl, unsubToken);
    const unsubApiUrl = buildUnsubscribeApiUrl(baseUrl, unsubToken);
    const bodies = buildOutgoingBodies({
      text: job.bodyText || "",
      html: job.bodyHtml || "",
      companyName: compliance.companyName,
      postalAddress: compliance.postalAddress,
      unsubUrl: unsubPageUrl,
    });
    const textBody = bodies.text;
    const htmlBody = injectEmailTracking(bodies.html, job.id, baseUrl, {
      trackOpens: campaign.trackOpens ?? true,
    });

    // Dry-run: prove enqueue→process path without live SMTP
    if (dryRun) {
      const nowDry = new Date().toISOString();
      await db
        .update(schema.emailJobs)
        .set({
          status: "sent",
          messageId: `dry-run-${job.id}`,
          sentAt: nowDry,
          processingAt: null,
          lastError: null,
          bodyText: textBody,
          bodyHtml: htmlBody,
          updatedAt: nowDry,
        })
        .where(eq(schema.emailJobs.id, job.id));
      const steps = await loadCampaignSequenceSteps(db, job.campaignId);
      await advanceSequenceAfterSend(db, {
        campaignId: job.campaignId,
        campaignLeadId: job.campaignLeadId,
        stepPosition: job.stepPosition ?? 1,
        sentAt: nowDry,
        steps,
      });
      await db
        .update(schema.leads)
        .set({ status: "contacted", updatedAt: nowDry })
        .where(eq(schema.leads.id, job.leadId));
      await recordSend(db, { userId: campaign.userId, entityType: "sender", entityId: sender.id });
      await recordSend(db, { userId: campaign.userId, entityType: "campaign", entityId: campaign.id });
      noteHourlySend(sender.id);
      return "sent";
    }

    // Atomic capacity reservation immediately before the network call. The
    // scheduler checks this too, but jobs can sit in the queue for hours; the
    // conditional upsert makes the cap safe even with overlapping workers.
    // The cap includes the new-mailbox ramp (10/day, +5/day, up to 30).
    const senderCap = senderDailyCap(
      sender as SenderRow & { createdAt?: string },
      campaign.maxEmailsPerSenderPerDay,
    );
    const reservation = await reserveSendSlot(db, {
      userId: campaign.userId,
      senderId: sender.id,
      campaignId: campaign.id,
      senderCap,
      campaignCap: Math.max(1, campaign.dailyLimit),
    });
    if (!reservation.ok) {
      const retryAt = addSeconds(new Date(), 3600).toISOString();
      await db
        .update(schema.emailJobs)
        .set({
          status: "pending",
          scheduledFor: retryAt,
          processingAt: null,
          updatedAt: nowS,
        })
        .where(eq(schema.emailJobs.id, job.id));
      return "skipped";
    }
    reserved = true;

    const from = sender.fromName ? `"${sender.fromName.replace(/"/g, "")}" <${sender.email}>` : sender.email;
    const transporter = makeTransport(sender);
    let info;
    try {
      // RFC 8058 one-click: List-Unsubscribe points at the POST endpoint.
      const unsubHeaders = listUnsubscribeHeaders(unsubApiUrl);

      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (job.stepPosition && job.stepPosition > 1) {
        const prior = await db
          .select({ messageId: schema.emailJobs.messageId })
          .from(schema.emailJobs)
          .where(
            and(
              eq(schema.emailJobs.campaignLeadId, job.campaignLeadId),
              eq(schema.emailJobs.status, "sent"),
            )
          )
          .orderBy(asc(schema.emailJobs.sentAt));
        const ids = prior
          .map((p: { messageId: string | null }) => p.messageId)
          .filter((id: string | null): id is string => Boolean(id));
        if (ids.length > 0) {
          inReplyTo = ids[ids.length - 1];
          references = ids.join(" ");
        }
      }

      const mailOptions: any = {
        from,
        to: job.toEmail,
        replyTo: sender.replyTo || undefined,
        subject: job.subject,
        text: textBody || undefined,
        html: htmlBody || undefined,
        headers: {
          ...unsubHeaders,
        },
      };
      if (inReplyTo) {
        mailOptions.inReplyTo = inReplyTo;
        mailOptions.references = references || inReplyTo;
      }

      info = await transporter.sendMail(mailOptions);
    } finally {
      transporter.close();
    }

    // Success — job done
    await db
      .update(schema.emailJobs)
      .set({
        status: "sent",
        messageId: String(info?.messageId ?? "") || null,
        sentAt: nowS,
        processingAt: null,
        lastError: null,
        updatedAt: nowS,
      })
      .where(eq(schema.emailJobs.id, job.id));
    const steps = await loadCampaignSequenceSteps(db, job.campaignId);
    await advanceSequenceAfterSend(db, {
      campaignId: job.campaignId,
      campaignLeadId: job.campaignLeadId,
      stepPosition: job.stepPosition ?? 1,
      sentAt: nowS,
      steps,
    });
    await db
      .update(schema.leads)
      .set({ status: "contacted", updatedAt: nowS })
      .where(eq(schema.leads.id, job.leadId));
    // The atomic reservation already recorded this send for both sender and
    // campaign; do not increment the counters a second time.
    noteHourlySend(sender.id);
    return "sent";
  } catch (err: any) {
    if (reserved) {
      try {
        await releaseSendSlot(db, {
          userId: campaign.userId,
          senderId: sender.id,
          campaignId: campaign.id,
        });
      } catch (releaseErr) {
        console.error("[processor] failed to release send reservation:", releaseErr);
      }
    }
    const failure = classifySmtpError(err);
    const attempts = job.attempts + 1;
    const message = failure.message;
    // 4xx (rate limit, greylisting, timeout) and mailbox problems → retry;
    // permanent 5xx for this recipient/message → fail the job.
    const willRetry = !failure.permanent && campaign.retryFailed && attempts < job.maxAttempts;

    // Only a broken MAILBOX (bad credentials, unreachable server) counts
    // against the sender. Recipient- and content-level rejections never do.
    if (failureBlamesSender(failure)) {
      const definiteAuth = failure.kind === "auth" && failure.code !== 454;
      const health = Math.max(0, (sender.health ?? 100) - (failure.kind === "auth" ? 25 : 10));
      await db
        .update(schema.senderAccounts)
        .set({
          health,
          smtpStatus: "failed",
          status: definiteAuth || health < 50 ? "failed" : sender.status,
          updatedAt: nowS,
        })
        .where(eq(schema.senderAccounts.id, sender.id));
    }

    if (willRetry) {
      const backoffSec = randomBetween(300, 900) * attempts; // 5–15 min × attempt
      await db
        .update(schema.emailJobs)
        .set({
          status: "retry",
          attempts,
          lastError: message,
          processingAt: null,
          updatedAt: nowS,
        })
        .where(eq(schema.emailJobs.id, job.id));
      await db
        .update(schema.campaignLeads)
        .set({ status: "scheduled", lastError: message, attempts, updatedAt: nowS })
        .where(eq(schema.campaignLeads.id, job.campaignLeadId));
      // retry jobs re-enter as pending with a future schedule
      await db
        .update(schema.emailJobs)
        .set({ status: "pending", scheduledFor: addSeconds(new Date(), backoffSec).toISOString() })
        .where(eq(schema.emailJobs.id, job.id));
      return "retry";
    }

    if (failure.hardBounce) {
      // The address does not exist: suppress it for every client and stop
      // the rest of this lead's sequence. The mailbox is fine.
      await recordHardBounce(db, {
        email: job.toEmail,
        leadId: job.leadId,
        jobId: job.id,
        campaignId: campaign.id,
        ownerUserId: lead.userId || campaign.userId,
        workspaceId: lead.workspaceId ?? null,
        status: failure.enhanced || String(failure.code ?? "5.0.0"),
        diagnostic: message,
        via: "smtp",
      });
      await db
        .update(schema.emailJobs)
        .set({ attempts, processingAt: null, updatedAt: nowS })
        .where(eq(schema.emailJobs.id, job.id));
      return "failed";
    }

    await db
      .update(schema.emailJobs)
      .set({ status: "failed", attempts, lastError: message, processingAt: null, updatedAt: nowS })
      .where(eq(schema.emailJobs.id, job.id));
    await db
      .update(schema.campaignLeads)
      .set({ status: "failed", attempts, lastError: message, updatedAt: nowS })
      .where(eq(schema.campaignLeads.id, job.campaignLeadId));
    await db.insert(schema.activityLogs).values({
      id: crypto.randomUUID(),
      userId: campaign.userId,
      type: "email_failed",
      message: `Failed to reach ${job.toEmail}: ${message.slice(0, 180)}`,
      campaignId: campaign.id,
    });
    return "failed";
  }
}

async function cancelJobChain(db: EngineDb, job: JobRow, reason: string) {
  const nowS = new Date().toISOString();
  await db
    .update(schema.emailJobs)
    .set({ status: "cancelled", lastError: reason, processingAt: null, updatedAt: nowS })
    .where(eq(schema.emailJobs.id, job.id));
  await db
    .update(schema.campaignLeads)
    .set({ status: "cancelled", lastError: reason, updatedAt: nowS })
    .where(eq(schema.campaignLeads.id, job.campaignLeadId));
}

export async function processTick(db: EngineDb, now = new Date()): Promise<ProcessResult> {
  const result: ProcessResult = { sent: 0, failed: 0, retried: 0, recovered: 0, skipped: 0, held: 0 };
  result.recovered = await recoverStuckJobs(db, now);
  const jobs = await claimDueJobs(db, now);
  for (const job of jobs) {
    try {
      const r = await processJob(db, job);
      if (r === "sent") result.sent++;
      else if (r === "retry") result.retried++;
      else if (r === "failed") result.failed++;
      else if (r === "held") result.held++;
      else result.skipped++;
    } catch (err) {
      console.error(`[processor] job ${job.id} crashed:`, err);
      result.failed++;
    }
  }
  return result;
}

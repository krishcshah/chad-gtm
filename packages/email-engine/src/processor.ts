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
  loadWorkspaceProfile,
  schema,
} from "@smartreach/database";
import { addSeconds, randomBetween } from "@smartreach/shared";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { EngineDb, JobRow, SenderRow } from "./db-port";
import { makeTransport } from "./mailer";
import {
  campaignDayKey,
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
import { loadUnapprovedOwners, OWNER_NOT_APPROVED_NOTE } from "./owner-approval";
import { classifySmtpError, failureBlamesSender, isPolicyStatus } from "./smtp-errors";
import { completeBodies } from "./body-format";
import { flagSenderPolicyBlock, recordHardBounce } from "./bounces";
import { isRepliedLeadStatus } from "./lead-outcomes";
import { isInSendingWindow } from "./scheduler";
import {
  noteSenderSendSucceeded,
  REPLIES_UNREADABLE_HOLD_REASON,
  repliesUnreadable,
  senderStatusAfterError,
} from "./mailbox-health";

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
        // Only jobs of a sending campaign: a paused or archived campaign's
        // jobs must never fill the batch and starve everyone else.
        sql`EXISTS (SELECT 1 FROM ${schema.campaigns} WHERE ${schema.campaigns.id} = ${schema.emailJobs.campaignId} AND ${schema.campaigns.status} IN ('running','scheduled') AND ${schema.campaigns.deletedAt} IS NULL)`,
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
    if (unrecordedSends.has(s.id)) continue; // delivered; bookkeeping is being reconciled
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

/**
 * Sender identity for the footer: the campaign's workspace (company name,
 * postal address), else the autopilot run's company name. A workspace that
 * can't be found gives a blank address, so the job is held.
 */
async function loadComplianceInfo(
  db: EngineDb,
  campaign: { id: string; userId: string; workspaceId?: string | null },
): Promise<{ companyName: string; postalAddress: string }> {
  const profile = await loadWorkspaceProfile(db, { userId: campaign.userId, workspaceId: campaign.workspaceId ?? null });
  const postalAddress = profile.postalAddress;
  let companyName = profile.companyName;
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

/** Rows returned by a raw db.execute (node-postgres gives {rows}, neon an array). */
function executedRowCount(res: unknown): number {
  const r = res as { rows?: unknown[]; length?: number } | null | undefined;
  return r?.rows?.length ?? r?.length ?? 0;
}

/**
 * A campaign stopped sending (paused / archived): drop its unsent queued jobs
 * and put those leads back in line, so the scheduler gives them fresh, paced
 * times when it runs again. One statement, so a lead is never left
 * "scheduled" with no job. Jobs being sent right now ('processing') are left
 * alone. Rows are deleted, never cancelled: the (campaign_lead_id,
 * step_position) unique index plus the scheduler's onConflictDoNothing would
 * turn a re-enqueue of a cancelled row into a silent no-op.
 */
export async function releaseCampaignJobs(
  db: EngineDb,
  campaignId: string,
  reason: string,
  now: Date = new Date(),
): Promise<number> {
  const nowS = now.toISOString();
  const res = await db.execute(sql`
    WITH released AS (
      DELETE FROM email_jobs
      WHERE campaign_id = ${campaignId} AND status IN ('pending','retry')
      RETURNING campaign_lead_id
    )
    UPDATE campaign_leads
    SET status = 'queued', scheduled_for = ${nowS}, last_error = ${reason}, updated_at = ${nowS}
    WHERE id IN (SELECT campaign_lead_id FROM released) AND status = 'scheduled'
    RETURNING id`);
  return executedRowCount(res);
}

/** Reason stored on leads released because their campaign stopped sending. */
export const CAMPAIGN_NOT_RUNNING_REASON = "campaign-not-running";

/**
 * Self-healing sweep: the same release for every campaign that is not
 * running/scheduled (or is deleted), whatever path stopped it.
 */
export async function releaseInactiveCampaignJobs(db: EngineDb, now: Date = new Date()): Promise<number> {
  const nowS = now.toISOString();
  const res = await db.execute(sql`
    WITH released AS (
      DELETE FROM email_jobs j
      USING campaigns c
      WHERE j.campaign_id = c.id
        AND j.status IN ('pending','retry')
        AND (c.status NOT IN ('running','scheduled') OR c.deleted_at IS NOT NULL)
      RETURNING j.campaign_lead_id
    )
    UPDATE campaign_leads
    SET status = 'queued', scheduled_for = ${nowS}, last_error = ${CAMPAIGN_NOT_RUNNING_REASON}, updated_at = ${nowS}
    WHERE id IN (SELECT campaign_lead_id FROM released) AND status = 'scheduled'
    RETURNING id`);
  return executedRowCount(res);
}

const UNSENDABLE_LEAD_STATUSES = new Set(["bounced", "unsubscribed", "blocked"]);

/** Lead statuses a send may move to 'contacted'; anything later is never downgraded. */
export const CONTACTABLE_LEAD_STATUSES: ("new" | "contacted")[] = ["new", "contacted"];

export async function processJob(db: EngineDb, job: JobRow, now: Date = new Date()): Promise<JobOutcome> {
  const nowS = new Date().toISOString();

  // Already delivered by this worker (bookkeeping failed earlier): finish the
  // bookkeeping, never send again.
  const delivered0 = unrecordedSends.get(job.id);
  if (delivered0) {
    await recordDelivered(db, delivered0);
    return "sent";
  }

  // Load sender + campaign (fresh, to honor just-paused states)
  const senders: SenderRow[] = await db
    .select()
    .from(schema.senderAccounts)
    .where(eq(schema.senderAccounts.id, job.senderId))
    .limit(1);
  const sender = senders[0];
  const campaigns = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, job.campaignId)).limit(1);
  const campaign = campaigns[0];

  // Campaign paused/archived mid-flight → drop the job and hand the lead
  // back to the scheduler (fresh, paced times when the campaign runs again).
  if (!campaign || !["running", "scheduled"].includes(campaign.status) || campaign.deletedAt) {
    await releaseToScheduler(db, job, CAMPAIGN_NOT_RUNNING_REASON);
    return "skipped";
  }
  // Owner's approval revoked since scheduling → hand the lead back to the
  // scheduler, which skips the campaign until the owner is approved again.
  if ((await loadUnapprovedOwners(db, [campaign.userId])).size > 0) {
    await releaseToScheduler(db, job, OWNER_NOT_APPROVED_NOTE);
    return "skipped";
  }
  // Lead replied, bounced, opted out (or was deleted) since scheduling → cancel
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.id, job.leadId)).limit(1);
  const lead = leads[0];
  if (
    !lead ||
    lead.deletedAt ||
    UNSENDABLE_LEAD_STATUSES.has(String(lead.status)) ||
    (campaign.stopOnReply && isRepliedLeadStatus(lead.status))
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

  // The mailbox's inbox can't be read, so a reply to it may be sitting
  // unrecorded. Never send a follow-up blind: hold it on this mailbox. A
  // step-1 email goes back to the scheduler, which picks a readable mailbox.
  if (repliesUnreadable(sender)) {
    if ((job.stepPosition ?? 1) > 1) {
      await holdJob(db, job, REPLIES_UNREADABLE_HOLD_REASON);
      return "held";
    }
    await releaseToScheduler(db, job, "sender-replies-unreadable");
    return "skipped";
  }

  // Outside the campaign's sending hours (e.g. a backlog after Resume, or a
  // job that waited past the window): never send it now. The scheduler
  // re-creates it with fresh, paced times when the window opens.
  if (!isInSendingWindow(campaign, now)) {
    await releaseToScheduler(db, job, "outside-sending-window");
    return "held";
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
  let delivered = false;
  // The campaign's daily limit counts per local day in its timezone; the
  // mailbox counter stays on the UTC day.
  const campaignDate = campaignDayKey(campaign, now);

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
        .where(and(eq(schema.leads.id, job.leadId), inArray(schema.leads.status, CONTACTABLE_LEAD_STATUSES)));
      await recordSend(db, { userId: campaign.userId, entityType: "sender", entityId: sender.id });
      await recordSend(db, {
        userId: campaign.userId,
        entityType: "campaign",
        entityId: campaign.id,
        date: campaignDate,
      });
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
      campaignDate,
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

    // The email is out. From here on nothing may make the job retryable:
    // a bookkeeping error must never re-send the same email.
    delivered = true;
    const record: DeliveredJob = {
      jobId: job.id,
      campaignId: job.campaignId,
      campaignLeadId: job.campaignLeadId,
      leadId: job.leadId,
      stepPosition: job.stepPosition ?? 1,
      messageId: String(info?.messageId ?? "") || null,
      sentAt: nowS,
      stage: 0,
    };
    unrecordedSends.set(job.id, record);
    await recordDelivered(db, record);
    // A live send worked: reset the mailbox's error streak (best effort).
    try {
      await noteSenderSendSucceeded(db, sender.id);
    } catch {
      /* never affects the job outcome */
    }
    // The atomic reservation already recorded this send for both sender and
    // campaign; do not increment the counters a second time.
    noteHourlySend(sender.id);
    return "sent";
  } catch (err: any) {
    if (delivered) {
      // SMTP accepted the message but a database write failed afterwards.
      // Keep the reservation, never retry; recordDelivered is retried on the
      // next tick (and recoverStuckJobs / processJob will not re-send it).
      console.error(`[processor] job ${job.id} was sent but bookkeeping failed; will reconcile:`, err);
      noteHourlySend(sender.id);
      return "sent";
    }
    if (reserved) {
      try {
        await releaseSendSlot(db, {
          userId: campaign.userId,
          senderId: sender.id,
          campaignId: campaign.id,
          campaignDate,
        });
      } catch (releaseErr) {
        console.error("[processor] failed to release send reservation:", releaseErr);
      }
    }
    const failure = classifySmtpError(err);
    const attempts = job.attempts + 1;
    const message = failure.message;

    // The MAILBOX was refused as a sender (MAIL FROM, sender domain, relay
    // denied, daily sending quota). The lead did nothing wrong: never fail
    // it and never suppress it.
    if (failure.kind === "sender") {
      if (failure.senderQuota || !failure.permanent) {
        // Provider quota / temporary: try this job again later, same mailbox.
        await holdJob(db, job, `Mailbox sending limit: ${message}`.slice(0, 500));
        return "held";
      }
      await db
        .update(schema.senderAccounts)
        .set({
          health: Math.max(0, (sender.health ?? 100) - 25),
          smtpStatus: "failed",
          status: "failed",
          failedReason: message.slice(0, 300),
          updatedAt: nowS,
        })
        .where(eq(schema.senderAccounts.id, sender.id));
      await db.insert(schema.activityLogs).values({
        id: crypto.randomUUID(),
        userId: sender.userId,
        type: "sender.failed",
        message: `${sender.email} was refused as a sender and taken out of rotation: ${message.slice(0, 180)}`,
        campaignId: null,
        meta: { senderId: sender.id, status: failure.enhanced ?? failure.code ?? null },
      });
      // Hand the lead to another mailbox (sticky rule switches when the step-1 mailbox is failed).
      await releaseToScheduler(db, job, "sender-refused");
      return "skipped";
    }

    // 4xx (rate limit, greylisting, timeout) and mailbox problems → retry;
    // permanent 5xx for this recipient/message → fail the job.
    const willRetry = !failure.permanent && campaign.retryFailed && attempts < job.maxAttempts;

    // Only a broken MAILBOX (bad credentials, unreachable server) counts
    // against the sender. Recipient- and content-level rejections never do.
    if (failureBlamesSender(failure)) {
      const definiteAuth = failure.kind === "auth" && failure.code !== 454;
      // Health is display only; the status follows consecutive errors.
      const health = Math.max(0, (sender.health ?? 100) - (failure.kind === "auth" ? 25 : 10));
      const failureCount = (sender.failureCount ?? 0) + 1;
      const status = senderStatusAfterError({ currentStatus: sender.status, definiteAuth, failureCount });
      await db
        .update(schema.senderAccounts)
        .set({
          health,
          smtpStatus: "failed",
          status,
          failureCount,
          ...(status === "failed" ? { failedReason: message.slice(0, 300) } : {}),
          updatedAt: nowS,
        })
        .where(eq(schema.senderAccounts.id, sender.id));
      // Only active mailboxes reach a send, so "failed" here is a transition.
      if (status === "failed") {
        await db
          .insert(schema.activityLogs)
          .values({
            id: crypto.randomUUID(),
            userId: sender.userId,
            type: "sender.failed",
            message: `${sender.email} was taken out of rotation after ${failureCount} ${failureCount === 1 ? "error" : "errors in a row"}: ${message.slice(0, 180)}`,
            campaignId: null,
            meta: { senderId: sender.id, reason: message.slice(0, 300) },
          })
          .catch((e: unknown) => console.error("[processor] could not log sender.failed:", e));
      }
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

    if (failure.permanent && isPolicyStatus(failure.enhanced)) {
      // Spam / policy / DMARC refusal: says something about this mailbox's
      // reputation or authentication, not about the address.
      await flagSenderPolicyBlock(db, {
        senderId: sender.id,
        senderUserId: sender.userId,
        senderEmail: sender.email,
        status: failure.enhanced!,
        diagnostic: message,
        via: "smtp",
      }).catch((e) => console.error("[processor] policy flag failed:", e));
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

/* ─── Sent-but-unrecorded jobs ──────────────────────────────────────────── */

/** A job SMTP accepted, with how far its bookkeeping got. */
export interface DeliveredJob {
  jobId: string;
  campaignId: string;
  campaignLeadId: string;
  leadId: string;
  stepPosition: number;
  messageId: string | null;
  sentAt: string;
  /** 0 = nothing recorded, 1 = job marked sent, 2 = sequence advanced, 3 = done. */
  stage: number;
}

/**
 * Jobs this process delivered whose database bookkeeping has not finished.
 * Entries leave only once recordDelivered completes; until then the job is
 * never handed to SMTP again by this worker.
 */
const unrecordedSends = new Map<string, DeliveredJob>();

/** Test hook / introspection: ids of delivered jobs still awaiting bookkeeping. */
export function unrecordedSendIds(): string[] {
  return [...unrecordedSends.keys()];
}

/** Idempotent bookkeeping for a delivered job; resumes from `stage`. */
async function recordDelivered(db: EngineDb, rec: DeliveredJob): Promise<void> {
  if (rec.stage < 1) {
    await db
      .update(schema.emailJobs)
      .set({
        status: "sent",
        messageId: rec.messageId,
        sentAt: rec.sentAt,
        processingAt: null,
        lastError: null,
        updatedAt: rec.sentAt,
      })
      .where(eq(schema.emailJobs.id, rec.jobId));
    rec.stage = 1;
  }
  if (rec.stage < 2) {
    const steps = await loadCampaignSequenceSteps(db, rec.campaignId);
    await advanceSequenceAfterSend(db, {
      campaignId: rec.campaignId,
      campaignLeadId: rec.campaignLeadId,
      stepPosition: rec.stepPosition,
      sentAt: rec.sentAt,
      steps,
    });
    rec.stage = 2;
  }
  if (rec.stage < 3) {
    // Never downgrade a reply, funnel stage, bounce or opt-out that landed
    // while the email was in flight.
    await db
      .update(schema.leads)
      .set({ status: "contacted", updatedAt: rec.sentAt })
      .where(and(eq(schema.leads.id, rec.leadId), inArray(schema.leads.status, CONTACTABLE_LEAD_STATUSES)));
    rec.stage = 3;
  }
  unrecordedSends.delete(rec.jobId);
}

/** Retry bookkeeping for delivered jobs whose writes failed earlier. Never sends. */
export async function reconcileDeliveredJobs(db: EngineDb): Promise<number> {
  let done = 0;
  for (const rec of [...unrecordedSends.values()]) {
    try {
      await recordDelivered(db, rec);
      done++;
    } catch (err) {
      console.error(`[processor] reconcile of sent job ${rec.jobId} failed; will retry:`, err);
    }
  }
  return done;
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
  await reconcileDeliveredJobs(db);
  // Release queued jobs of campaigns that stopped sending (any path). A
  // failure here must not break the tick: claimDueJobs skips those jobs anyway.
  try {
    await releaseInactiveCampaignJobs(db, now);
  } catch (err) {
    console.error("[processor] releasing jobs of stopped campaigns failed:", err);
  }
  result.recovered = await recoverStuckJobs(db, now);
  const jobs = await claimDueJobs(db, now);
  for (const job of jobs) {
    try {
      const r = await processJob(db, job, now);
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

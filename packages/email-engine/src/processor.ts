/**
 * Processor — the only place that touches the network for sending.
 *
 * Claims due jobs atomically (pending → processing with a conditional update
 * on scheduleFor so two workers can't double-send), sends via SMTP through
 * the assigned sender, records usage counters, handles automatic retries with
 * backoff, and recovers jobs stuck in "processing" after a crash.
 */
import {
  matchesSuppression,
  schema,
} from "@smartreach/database";
import { addSeconds, nowIso, randomBetween } from "@smartreach/shared";
import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { EngineDb, JobRow, SenderRow } from "./db-port";
import { makeTransport } from "./mailer";
import { noteHourlySend, recordSend } from "./rotation";
import { isEngineDryRun, workerOwnsJob } from "./queue-mode";
import { advanceSequenceAfterSend, loadCampaignSequenceSteps } from "./sequence";

const BATCH = Number(process.env.ENGINE_BATCH_SIZE ?? 25);
const STUCK_AFTER_MS = 3 * 60_000;

export interface ProcessResult {
  sent: number;
  failed: number;
  retried: number;
  recovered: number;
  skipped: number;
}

/** Claim due jobs: conditional CAS update makes it safe across overlapping workers. */
export async function claimDueJobs(db: EngineDb, now = new Date(), limit = BATCH): Promise<JobRow[]> {
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

export async function processJob(db: EngineDb, job: JobRow): Promise<"sent" | "retry" | "failed" | "skipped"> {
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
  // Lead replied (or was deleted) since scheduling → cancel
  const leads = await db.select().from(schema.leads).where(eq(schema.leads.id, job.leadId)).limit(1);
  const lead = leads[0];
  if (!lead || lead.deletedAt || (campaign.stopOnReply && lead.status === "replied")) {
    await cancelJobChain(db, job, "lead-no-longer-sendable");
    return "skipped";
  }

  // F15: re-check suppression at send time
  const suppressionRows: { value: string }[] = await db
    .select({ value: schema.suppressions.value })
    .from(schema.suppressions)
    .where(eq(schema.suppressions.userId, campaign.userId));
  if (matchesSuppression(job.toEmail, suppressionRows.map((r) => r.value))) {
    await cancelJobChain(db, job, "suppressed");
    return "skipped";
  }

  // Sender died since scheduling → requeue for the scheduler to reassign
  if (!sender || sender.status !== "active") {
    await db
      .update(schema.emailJobs)
      .set({ status: "pending", scheduledFor: addSeconds(new Date(), 600).toISOString(), processingAt: null, updatedAt: nowS })
      .where(eq(schema.emailJobs.id, job.id));
    return "skipped";
  }

  try {
    // Send bodies as enqueued — no auto postal/unsub footer or List-Unsubscribe header.
    // {{unsubscribe_url}} is resolved at schedule time when the template includes it.
    const textBody = job.bodyText || "";
    const htmlBody = job.bodyHtml || job.bodyText || "";
    const dryRun = isEngineDryRun();

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

    const transporter = makeTransport(sender);
    const from = sender.fromName ? `"${sender.fromName.replace(/"/g, "")}" <${sender.email}>` : sender.email;
    let info;
    try {
      info = await transporter.sendMail({
        from,
        to: job.toEmail,
        replyTo: sender.replyTo || undefined,
        subject: job.subject,
        text: textBody || undefined,
        html: htmlBody || undefined,
      });
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
    await recordSend(db, { userId: campaign.userId, entityType: "sender", entityId: sender.id });
    await recordSend(db, { userId: campaign.userId, entityType: "campaign", entityId: campaign.id });
    noteHourlySend(sender.id);
    return "sent";
  } catch (err: any) {
    const attempts = job.attempts + 1;
    const message: string = err?.response || err?.message || "Send failed";
    const code: number | undefined = err?.responseCode;
    const permanent = !!code && code >= 500 && code < 600 && code !== 521 && code !== 542; // 5xx usually permanent (mailbox rejected);
    // 4xx (rate limit, greylisting, timeout) → retry
    const willRetry = !permanent && campaign.retryFailed && attempts < job.maxAttempts;

    // penalize sender health; mark failed below threshold
    const health = Math.max(0, (sender.health ?? 100) - (permanent ? 25 : 10));
    await db
      .update(schema.senderAccounts)
      .set({
        health,
        smtpStatus: "failed",
        status: health < 50 ? "failed" : sender.status,
        updatedAt: nowS,
      })
      .where(eq(schema.senderAccounts.id, sender.id));

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

    await db
      .update(schema.emailJobs)
      .set({ status: "failed", attempts, lastError: message, processingAt: null, updatedAt: nowS })
      .where(eq(schema.emailJobs.id, job.id));
    await db
      .update(schema.campaignLeads)
      .set({ status: "failed", attempts, lastError: message, updatedAt: nowS })
      .where(eq(schema.campaignLeads.id, job.campaignLeadId));
    await db
      .update(schema.leads)
      .set({ status: permanent ? "bounced" : "contacted", updatedAt: nowS })
      .where(eq(schema.leads.id, job.leadId));
    await db
      .update(schema.emailJobs)
      .set({ status: "bounced" })
      .where(and(eq(schema.emailJobs.id, job.id), sql`${permanent ? 1 : 0} = 1`));
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
  const result: ProcessResult = { sent: 0, failed: 0, retried: 0, recovered: 0, skipped: 0 };
  result.recovered = await recoverStuckJobs(db, now);
  const jobs = await claimDueJobs(db, now);
  for (const job of jobs) {
    try {
      const r = await processJob(db, job);
      if (r === "sent") result.sent++;
      else if (r === "retry") result.retried++;
      else if (r === "failed") result.failed++;
      else result.skipped++;
    } catch (err) {
      console.error(`[processor] job ${job.id} crashed:`, err);
      result.failed++;
    }
  }
  return result;
}

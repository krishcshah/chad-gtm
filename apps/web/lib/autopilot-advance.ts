/**
 * Session-free autopilot launch: the one code path behind the Launch button.
 *
 * Deliberately NOT a "use server" module: these take a trusted user id, so the
 * browser can never call them. Server actions call them after checking who is
 * asking (the run's owner via requireUser, or an admin approving the account).
 */
import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { nowIso } from "@smartreach/shared";
import { getDb, ensureChadGtmTables } from "./db";
import { ensureDefaultWorkspace } from "./workspaces";
import { COMPLIANCE_REQUIRED_ERROR, LaunchError, LaunchInProgressError, launchRunCampaign } from "./gtm-launch";
import { assertCanSend, getSendAccess, isSendAccessError } from "./approval";
import {
  LAUNCH_FAILURE_MESSAGES,
  clampAutopilotDaily,
  launchClaimActive,
  readLaunchFailure,
  type LaunchFailure,
} from "./autopilot-policy";
import { loadLaunchContext, runBlockers, runLaunchState, type LaunchContext, type RunLaunchState } from "./autopilot-state";
import {
  AUTO_RETRY_MESSAGES,
  approvalNoteFor,
  readApprovalLaunch,
  type ApprovalLaunchNote,
  type ApprovalLaunchRecord,
  type ApprovalRunResult,
  type NotStartedRun,
} from "./approval-copy";
import { buildApprovalEmail, buildApprovalLaunchGaveUpEmail } from "./system-emails";
import type { AutopilotOutcome } from "./autopilot-actions";

type RunRow = typeof schema.chadGtmRuns.$inferSelect;

/** The user's own run, unless it was deleted (#55). */
export async function loadOwnedRun(runId: string, userId: string) {
  const db = getDb();
  await ensureChadGtmTables(db);
  const [run] = await db
    .select()
    .from(schema.chadGtmRuns)
    .where(
      and(
        eq(schema.chadGtmRuns.id, runId),
        eq(schema.chadGtmRuns.userId, userId),
        // A deleted draft can't be brought back by any action (#55).
        isNull(schema.chadGtmRuns.dismissedAt),
      ),
    )
    .limit(1);
  return run ?? null;
}

export function outcomeFor(run: RunRow, state: RunLaunchState, ctx: LaunchContext): AutopilotOutcome {
  const details = state.blockers.find((b) => b.kind === "details");
  const reason =
    state.phase === "launch_failed"
      ? state.launchFailure?.message || LAUNCH_FAILURE_MESSAGES.error
      : state.phase === "needs_research" || state.phase === "needs_details" || state.phase === "awaiting_approval"
        ? state.blockers[0]?.message
        : undefined;
  return {
    runId: run.id,
    phase: state.phase,
    companyName: run.companyName,
    campaignId: run.campaignId ?? undefined,
    missing: details && details.kind === "details" ? details.missing : undefined,
    // Exactly what the footer will carry: never the researched name as if it were the sender's.
    identity: {
      companyName: ctx.identity.companyName,
      postalAddress: ctx.identity.postalAddress,
      workspaceName: ctx.workspaceName ?? "",
    },
    suggestedCompanyName: !ctx.identity.companyName.trim() && run.companyName ? run.companyName : undefined,
    bookingUrl: run.bookingUrl,
    reason,
  };
}

/**
 * Refresh the pages that show this run. Best effort: outside a request (the
 * approval retry loop, a background launch after approval) next/cache throws
 * ("static generation store missing"), and that must never turn a launch
 * that worked into an error. Those pages are dynamic and re-read on the next visit.
 */
export function revalidateRun(runId: string) {
  for (const p of ["/chad-gtm", `/chad-gtm/${runId}`, "/dashboard"]) {
    try {
      revalidatePath(p);
    } catch {
      // Not in a request: nothing cached to refresh here.
    }
  }
}

async function launchAutopilotRun(run: RunRow, userId: string) {
  const db = getDb();
  // Server-side gate, independent of any UI state.
  await assertCanSend(userId);
  return launchRunCampaign(db, {
    run,
    userId,
    // The workspace the run is listed under (none = the default one), never
    // the active one: its campaign and footer identity come from there (#73).
    workspaceId: run.workspaceId ?? (await ensureDefaultWorkspace(userId)).id,
    // The run's chosen volume (a chosen 30 stays 30); the default only when unset.
    dailyLimit: clampAutopilotDaily(run.dailyEmailLimit),
    // Samples approved in guided setup before the account was approved (else none).
    approvedSamples: Array.isArray(run.approvedEmailSamples) ? (run.approvedEmailSamples as any[]) : [],
    selectedOfferIndex: 0,
  });
}

/**
 * What advancing did. linked: already has a campaign. still_launching: another
 * request holds the launch claim. blocked: something (see data.phase) stops the
 * launch. launched: live. linked_not_started: set up but the final start failed.
 * launch_failed: nothing sent, failure recorded on the run.
 */
export type AdvanceEvent = "linked" | "still_launching" | "blocked" | "launched" | "linked_not_started" | "launch_failed";

export type AdvanceResult =
  | { ok: false; error: string }
  | {
      ok: true;
      event: AdvanceEvent;
      data: AutopilotOutcome;
      /** The run as last read (after launch: re-read, with its audience state). */
      run: RunRow;
      launched?: { campaignId: string; leadCount: number };
    };

/**
 * Move an autopilot run as far as it can go: record what blocks it, or launch.
 * Never leaves a run looking live without a running campaign. Session-free:
 * the caller must have checked that `userId` may act on this run.
 */
export async function advanceRunForUser(runId: string, userId: string): Promise<AdvanceResult> {
  const db = getDb();
  let run = await loadOwnedRun(runId, userId);
  if (!run) return { ok: false, error: "Run not found." };
  if (!run.autopilot) {
    await db.update(schema.chadGtmRuns).set({ autopilot: true, updatedAt: nowIso() }).where(eq(schema.chadGtmRuns.id, run.id));
    run = { ...run, autopilot: true };
  }

  const ctx = await loadLaunchContext(db, userId, { workspaceId: run.workspaceId });
  if (run.campaignId) {
    return { ok: true, event: "linked", data: outcomeFor(run, runLaunchState(run, ctx), ctx), run };
  }
  // Another request is launching this run right now: report it, don't start a second launch.
  if (launchClaimActive(run.launchStartedAt)) {
    return { ok: true, event: "still_launching", data: outcomeFor(run, runLaunchState(run, ctx), ctx), run };
  }

  const blockers = runBlockers(run, ctx);
  if (blockers.length > 0) {
    // Approval is the only blocker: the plan is ready, so show it as such.
    const status = blockers[0]!.kind === "approval" ? "ready" : "needs_input";
    run = { ...run, status };
    await db.update(schema.chadGtmRuns).set({ status, updatedAt: nowIso() }).where(eq(schema.chadGtmRuns.id, run.id));
    revalidateRun(run.id);
    return { ok: true, event: "blocked", data: outcomeFor(run, runLaunchState(run, ctx), ctx), run };
  }

  try {
    const launched = await launchAutopilotRun(run, userId);
    const fresh = (await loadOwnedRun(run.id, userId)) ?? run;
    revalidateRun(run.id);
    return {
      ok: true,
      event: "launched",
      data: { ...outcomeFor(fresh, runLaunchState(fresh, ctx), ctx), campaignId: launched.campaignId, leadCount: launched.leadCount },
      run: fresh,
      launched,
    };
  } catch (err) {
    if (err instanceof LaunchInProgressError) {
      // Lost the launch claim to a concurrent request. Not a failure: show its progress.
      const fresh = (await loadOwnedRun(run.id, userId)) ?? run;
      return { ok: true, event: "still_launching", data: outcomeFor(fresh, runLaunchState(fresh, ctx), ctx), run: fresh };
    }
    const message = err instanceof Error ? err.message : "";
    if (isSendAccessError(message) || message === COMPLIANCE_REQUIRED_ERROR) {
      // Approval or identity changed between the check and the launch: re-evaluate.
      const ctxNow = await loadLaunchContext(db, userId, { workspaceId: run.workspaceId });
      const status = runBlockers(run, ctxNow)[0]?.kind === "approval" ? "ready" : "needs_input";
      run = { ...run, status };
      await db.update(schema.chadGtmRuns).set({ status, updatedAt: nowIso() }).where(eq(schema.chadGtmRuns.id, run.id));
      revalidateRun(run.id);
      return { ok: true, event: "blocked", data: outcomeFor(run, runLaunchState(run, ctxNow), ctxNow), run };
    }
    console.error("[autopilot] launch failed", { runId: run.id, error: err });
    // The run was linked to its draft campaign before the error (the final
    // switch to running failed). The plan is set up and nothing sends: show it
    // as Paused, never as a failed launch.
    const linked = await loadOwnedRun(run.id, userId).catch(() => null);
    if (linked?.campaignId) {
      const [campaign] = await db
        .select({ status: schema.campaigns.status, deletedAt: schema.campaigns.deletedAt })
        .from(schema.campaigns)
        .where(eq(schema.campaigns.id, linked.campaignId))
        .limit(1)
        .catch(() => []);
      revalidateRun(run.id);
      return {
        ok: true,
        event: "linked_not_started",
        data: outcomeFor(linked, runLaunchState(linked, ctx, campaign ?? { status: "draft", deletedAt: null }), ctx),
        run: linked,
      };
    }
    const failure: LaunchFailure = {
      code: err instanceof LaunchError ? err.code : "error",
      message: err instanceof LaunchError ? err.message : LAUNCH_FAILURE_MESSAGES.error,
      at: nowIso(),
    };
    const calibrationProfile = { ...((run.calibrationProfile as any) || {}), launchFailure: failure };
    run = { ...run, status: "needs_input", calibrationProfile };
    const cp = schema.chadGtmRuns.calibrationProfile;
    await db
      .update(schema.chadGtmRuns)
      // Merge, never replace: keys written meanwhile (approvalLaunch) stay.
      .set({
        status: "needs_input",
        calibrationProfile: sql`coalesce(${cp}, '{}'::jsonb) || jsonb_build_object('launchFailure', ${JSON.stringify(failure)}::jsonb)`,
        updatedAt: nowIso(),
      })
      // Never mark a run that is linked to a campaign as failed.
      .where(and(eq(schema.chadGtmRuns.id, run.id), isNull(schema.chadGtmRuns.campaignId)));
    revalidateRun(run.id);
    return { ok: true, event: "launch_failed", data: outcomeFor(run, runLaunchState(run, ctx), ctx), run };
  }
}

/* ─── Launch on approval ──────────────────────────────────────────────── */

/**
 * Approving an account launches at most ONE run: the newest autopilot run
 * (unlaunched, not deleted) whose only blocker was approval, created or
 * updated in the last 14 days. Other waiting runs are listed in the approval
 * email for the client to open and launch; launching them all would multiply
 * the client's one emails-per-day control.
 */
export const APPROVAL_LAUNCH_WINDOW_MS = 14 * 24 * 60 * 60_000;
/**
 * A run younger than this is held until it is this old: the client's own start
 * may still be saving its choices (e.g. emails per day) on it.
 */
export const APPROVAL_LAUNCH_MIN_AGE_MS = 2 * 60_000;
/** Temporary launch failures are retried after this, doubling up to the max gap... */
export const APPROVAL_RETRY_BASE_MS = 15 * 60_000;
export const APPROVAL_RETRY_MAX_GAP_MS = 60 * 60_000;
/** ...until this long after approval. Then the client is told to retry. */
export const APPROVAL_RETRY_WINDOW_MS = 24 * 60 * 60_000;
/** Other waiting plans listed in the approval email. */
const NOT_STARTED_LIST_MAX = 5;
/** Approval launches retried per background tick. */
const RETRY_BATCH = 10;

function websiteKey(url: string | null | undefined): string {
  return String(url ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
}

function isoMs(value: string | null | undefined): number {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/** When the client last created or changed the run. */
function touchedAt(run: Pick<RunRow, "createdAt" | "updatedAt">): number {
  return Math.max(isoMs(run.createdAt), isoMs(run.updatedAt));
}

function runName(run: Pick<RunRow, "companyName" | "url">): string {
  return String(run.companyName ?? "").trim() || websiteKey(run.url) || "Your plan";
}

/** What approval will do for an account, worked out before anything launches. */
export interface ApprovalLaunchPlan {
  /**
   * launching: `runId` launches (in the background). details/research: the
   * newest waiting run needs the client first. none: nothing was waiting.
   */
  note: ApprovalLaunchNote;
  /** The 2-minute guard: launch no earlier than this (null = now). */
  holdUntil: string | null;
  /** Other ready plans that approval does not start. */
  notStarted: NotStartedRun[];
  /** The client's newest run of any kind: where a "none" email points them. */
  latestRunId: string | null;
  reapproved: boolean;
}

/**
 * Pick the one run approval launches (see APPROVAL_LAUNCH_WINDOW_MS). Reads
 * only; a launch failure recorded on a run means it was launched before, so
 * it was not waiting on approval.
 */
export async function planApprovalLaunch(
  userId: string,
  opts: { reapproved?: boolean; now?: Date } = {},
): Promise<ApprovalLaunchPlan> {
  const now = opts.now ?? new Date();
  const db = getDb();
  await ensureChadGtmTables(db);
  const candidates: RunRow[] = await db
    .select()
    .from(schema.chadGtmRuns)
    .where(
      and(
        eq(schema.chadGtmRuns.userId, userId),
        eq(schema.chadGtmRuns.autopilot, true),
        isNull(schema.chadGtmRuns.campaignId),
        isNull(schema.chadGtmRuns.dismissedAt),
      ),
    )
    .orderBy(desc(schema.chadGtmRuns.updatedAt))
    .limit(50);

  const contexts = new Map<string, Promise<LaunchContext>>();
  const contextFor = (run: RunRow) => {
    const key = run.workspaceId ?? "";
    if (!contexts.has(key)) contexts.set(key, loadLaunchContext(db, userId, { workspaceId: run.workspaceId }));
    return contexts.get(key)!;
  };

  const ready: Array<{ run: RunRow; inWindow: boolean }> = [];
  let waiting: { run: RunRow; blocker: ReturnType<typeof runBlockers>[number] } | null = null;
  const sorted = [...candidates].sort((a, b) => touchedAt(b) - touchedAt(a));
  for (const run of sorted) {
    // Defence in depth: the query is already scoped to this user.
    if (run.userId !== userId || run.campaignId || run.dismissedAt || !run.autopilot) continue;
    if (readLaunchFailure(run.calibrationProfile)) continue;
    const inWindow = now.getTime() - touchedAt(run) <= APPROVAL_LAUNCH_WINDOW_MS;
    // Approval itself no longer blocks (the account was just approved).
    const blockers = runBlockers(run, await contextFor(run)).filter((b) => b.kind !== "approval");
    if (blockers.length === 0) ready.push({ run, inWindow });
    else if (inWindow && !waiting) waiting = { run, blocker: blockers[0]! };
  }

  const chosen = ready.find((r) => r.inWindow)?.run ?? null;
  const notStarted = ready
    .filter((r) => r.run !== chosen)
    .slice(0, NOT_STARTED_LIST_MAX)
    .map((r) => ({ runId: r.run.id, name: runName(r.run) }));

  let latestRunId: string | null = chosen?.id ?? waiting?.run.id ?? null;
  if (!latestRunId) {
    const [latest] = await db
      .select({ id: schema.chadGtmRuns.id })
      .from(schema.chadGtmRuns)
      .where(and(eq(schema.chadGtmRuns.userId, userId), isNull(schema.chadGtmRuns.dismissedAt)))
      .orderBy(desc(schema.chadGtmRuns.createdAt))
      .limit(1);
    latestRunId = latest?.id ?? null;
  }

  const base = { notStarted, latestRunId, reapproved: Boolean(opts.reapproved) };
  if (chosen) {
    const readyAt = isoMs(chosen.createdAt) + APPROVAL_LAUNCH_MIN_AGE_MS;
    return {
      ...base,
      note: { kind: "launching", runId: chosen.id },
      holdUntil: readyAt > now.getTime() ? new Date(readyAt).toISOString() : null,
    };
  }
  if (waiting?.blocker.kind === "details") {
    return { ...base, holdUntil: null, note: { kind: "details", runId: waiting.run.id, missing: waiting.blocker.missing } };
  }
  if (waiting?.blocker.kind === "research") {
    return { ...base, holdUntil: null, note: { kind: "research", runId: waiting.run.id } };
  }
  return { ...base, holdUntil: null, note: { kind: "none" } };
}

/**
 * Merge `patch` into the run's calibration_profile.approvalLaunch in one
 * statement (other keys on the profile are untouched). With `expect`, only
 * when the stored record still has those values: the claim that stops two
 * workers from repeating an attempt or an email. True when a row changed.
 */
async function patchApprovalLaunch(
  runId: string,
  patch: Partial<ApprovalLaunchRecord>,
  expect: { attempts?: number; emailPending?: boolean } = {},
): Promise<boolean> {
  const db = getDb();
  const cp = schema.chadGtmRuns.calibrationProfile;
  const conditions = [eq(schema.chadGtmRuns.id, runId)];
  if (expect.attempts !== undefined) {
    conditions.push(sql`coalesce((${cp}->'approvalLaunch'->>'attempts')::int, 0) = ${expect.attempts}`);
  }
  if (expect.emailPending !== undefined) {
    conditions.push(sql`coalesce((${cp}->'approvalLaunch'->>'emailPending')::boolean, false) = ${expect.emailPending}`);
  }
  const rows: Array<{ id: string }> = await db
    .update(schema.chadGtmRuns)
    .set({
      calibrationProfile: sql`coalesce(${cp}, '{}'::jsonb) || jsonb_build_object('approvalLaunch', coalesce(${cp}->'approvalLaunch', '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb)`,
    })
    .where(and(...conditions))
    .returning({ id: schema.chadGtmRuns.id });
  return rows.length > 0;
}

/**
 * Reword the failure stored on an unlaunched run (what its page shows): the
 * "we retry for you" line while retries run, the "retry it yourself" line after.
 */
async function rewordLaunchFailure(runId: string, message: string): Promise<void> {
  const cp = schema.chadGtmRuns.calibrationProfile;
  await getDb()
    .update(schema.chadGtmRuns)
    .set({ calibrationProfile: sql`jsonb_set(${cp}, '{launchFailure,message}', to_jsonb(${message}::text))` })
    .where(and(eq(schema.chadGtmRuns.id, runId), isNull(schema.chadGtmRuns.campaignId), sql`(${cp}->'launchFailure') is not null`));
}

/** Lead conversations held while the account was on hold (one per lead, or address, per campaign). */
async function countHeldConversations(userId: string): Promise<number> {
  try {
    const [row] = await getDb()
      .select({
        n: sql<number>`count(distinct coalesce(${schema.replies.leadId}, lower(${schema.replies.fromEmail})) || '|' || coalesce(${schema.replies.campaignId}, ''))`,
      })
      .from(schema.replies)
      .where(and(eq(schema.replies.userId, userId), eq(schema.replies.agentStatus, "held")));
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

async function systemMailer() {
  const mod = await import("@smartreach/email-engine/system-mailer");
  return mod.isSystemMailerConfigured() ? mod.sendSystemEmail : null;
}

/** Email the client what approval did. False when no mailer, no user, or the send failed. */
export async function sendApprovalEmail(
  userId: string,
  input: { note: ApprovalLaunchNote | null; notStarted?: NotStartedRun[]; latestRunId?: string | null; reapproved?: boolean },
): Promise<boolean> {
  try {
    const send = await systemMailer();
    if (!send) return false;
    const db = getDb();
    const [user] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!user?.email) return false;
    let runId = input.latestRunId ?? null;
    if (!runId) {
      const [latest] = await db
        .select({ id: schema.chadGtmRuns.id })
        .from(schema.chadGtmRuns)
        .where(and(eq(schema.chadGtmRuns.userId, userId), isNull(schema.chadGtmRuns.dismissedAt)))
        .orderBy(desc(schema.chadGtmRuns.createdAt))
        .limit(1)
        .catch(() => [] as Array<{ id: string }>);
      runId = latest?.id ?? null;
    }
    const note = input.note;
    const email = buildApprovalEmail({
      name: user.name,
      appUrl: process.env.APP_URL,
      runId,
      // Approval never sends to leads: the reply agent's next tick opens Needs you cards for these.
      waitingCount: await countHeldConversations(userId),
      reapproved: input.reapproved,
      // A problem with no run to point at: the plain "open your plan and launch" email.
      launch: note && note.kind === "failed" && !note.runId ? null : note,
      notStarted: input.notStarted,
    });
    await send({ to: user.email, ...email });
    return true;
  } catch (err) {
    console.error("[approval] approval email failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * The quick half of an approval, run inside the admin's request: pick the run
 * and record the queued launch on it (the approvals list reads this record).
 * Launches nothing.
 */
export async function beginApprovalLaunch(
  userId: string,
  opts: { reapproved?: boolean; now?: Date } = {},
): Promise<ApprovalLaunchPlan> {
  const now = opts.now ?? new Date();
  const plan = await planApprovalLaunch(userId, { ...opts, now });
  const at = now.toISOString();
  const record = (state: ApprovalLaunchRecord["state"], extra: Partial<ApprovalLaunchRecord>): ApprovalLaunchRecord => ({
    state,
    note: plan.note,
    approvedAt: at,
    attempts: 0,
    nextAttemptAt: null,
    emailPending: false,
    reapproved: plan.reapproved,
    notStarted: plan.notStarted,
    updatedAt: at,
    ...extra,
  });
  const note = plan.note;
  if (note.kind === "launching") {
    // If the background launch dies, the retry loop picks it up at nextAttemptAt.
    const nextAttemptAt = plan.holdUntil ?? new Date(now.getTime() + APPROVAL_RETRY_BASE_MS).toISOString();
    await patchApprovalLaunch(note.runId, record("launching", { nextAttemptAt, emailPending: true }));
  } else if (note.kind === "details" || note.kind === "research") {
    // Nothing to launch: the record only lets the approvals list show "waiting".
    await patchApprovalLaunch(note.runId, record("done", {}));
  }
  return plan;
}

/**
 * The slow half, run in the background after the admin's request returns:
 * launch the queued run (after the 2-minute guard, if it holds the run) and
 * email the client. Never throws.
 */
export async function finishApprovalLaunch(userId: string, plan: ApprovalLaunchPlan | null): Promise<void> {
  try {
    if (!plan) {
      await sendApprovalEmail(userId, { note: null });
      return;
    }
    if (plan.note.kind === "launching") {
      if (plan.holdUntil) {
        // The 2-minute guard: wait it out here (the retry loop would also pick
        // it up; whichever claims the attempt first launches it).
        const wait = Date.parse(plan.holdUntil) - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, Math.min(wait, APPROVAL_LAUNCH_MIN_AGE_MS)));
      }
      const note = await attemptApprovalLaunch(plan.note.runId, userId);
      if (note === null) await recoverApprovalEmail(userId, plan.note.runId, plan);
      return;
    }
    await sendApprovalEmail(userId, {
      note: plan.note,
      notStarted: plan.notStarted,
      latestRunId: plan.latestRunId,
      reapproved: plan.reapproved,
    });
  } catch (err) {
    console.error("[approval] launch after approval failed", { userId, error: err });
  }
}

/**
 * The first attempt did nothing (attemptApprovalLaunch returned null). Usually
 * another worker took the attempt and sends the email. But if the run is gone
 * (deleted during the hold) or its approvalLaunch record was lost, nobody
 * would ever email the client that they were approved: say so now. A run
 * that is still waiting gets its record back and one more attempt.
 */
async function recoverApprovalEmail(userId: string, runId: string, plan: ApprovalLaunchPlan): Promise<void> {
  const run = await loadOwnedRun(runId, userId).catch(() => null);
  if (run && readApprovalLaunch(run.calibrationProfile)) return; // another worker has it (and the email)
  const base = { notStarted: plan.notStarted.filter((r) => r.runId !== runId), reapproved: plan.reapproved };
  if (run?.campaignId) {
    // Launched meanwhile (the client's own Launch): it is live.
    await sendApprovalEmail(userId, { ...base, note: { kind: "live", runId }, latestRunId: runId });
    return;
  }
  if (run) {
    const at = new Date().toISOString();
    const restored = await patchApprovalLaunch(run.id, {
      state: "launching",
      note: { kind: "launching", runId },
      approvedAt: at,
      attempts: 0,
      nextAttemptAt: new Date(Date.now() + APPROVAL_RETRY_BASE_MS).toISOString(),
      emailPending: true,
      reapproved: plan.reapproved,
      notStarted: base.notStarted,
      updatedAt: at,
    });
    if (restored && (await attemptApprovalLaunch(run.id, userId)) !== null) return;
  }
  // The run is gone: the plain approval email, pointing at their newest plan.
  await sendApprovalEmail(userId, { ...base, note: { kind: "none" }, latestRunId: null });
}

/** Temporary failure codes an approval launch retries on its own. */
function retryableCode(code: string | undefined): code is keyof typeof AUTO_RETRY_MESSAGES {
  return code === "no_senders" || code === "error";
}

/**
 * One approval-launch attempt on a run with a queued or retrying record,
 * through advanceRunForUser (the Launch button's path, with all its checks).
 * Records the outcome; retries temporary failures (busy mailboxes, errors,
 * a launch already in progress) until 24 h after approval; sends the approval
 * email after the first attempt. Returns the note, or null when there was
 * nothing to do (another worker took the attempt, or the run is gone).
 */
export async function attemptApprovalLaunch(
  runId: string,
  userId: string,
  now: Date = new Date(),
): Promise<ApprovalLaunchNote | null> {
  const run = await loadOwnedRun(runId, userId);
  if (!run) return null;
  const record = readApprovalLaunch(run.calibrationProfile);
  if (!record || record.state === "done") return null;
  const attempts = record.attempts + 1;
  // Claim this attempt: a worker that dies mid-launch is retried after the base gap.
  const claimed = await patchApprovalLaunch(
    run.id,
    { attempts, nextAttemptAt: new Date(now.getTime() + APPROVAL_RETRY_BASE_MS).toISOString(), updatedAt: now.toISOString() },
    { attempts: record.attempts },
  );
  if (!claimed) return null;

  let result: ApprovalRunResult;
  let failureCode: string | undefined;
  try {
    const res = await advanceRunForUser(run.id, userId);
    if (!res.ok) {
      result = { runId: run.id, event: "launch_failed", reason: res.error };
    } else {
      failureCode = res.event === "launch_failed" ? readLaunchFailure(res.run.calibrationProfile)?.code : undefined;
      result = { runId: run.id, event: res.event, phase: res.data.phase, missing: res.data.missing, reason: res.data.reason };
    }
  } catch (err) {
    console.error("[approval] launch attempt failed", { runId: run.id, error: err });
    result = { runId: run.id, event: "error" };
    failureCode = "error";
  }

  const temporary =
    result.event === "still_launching" ||
    result.event === "error" ||
    (result.event === "launch_failed" && retryableCode(failureCode));
  const approvedAt = isoMs(record.approvedAt) || now.getTime();
  const withinWindow = now.getTime() - approvedAt < APPROVAL_RETRY_WINDOW_MS;
  const code = retryableCode(failureCode) ? failureCode : "error";

  let note: ApprovalLaunchNote;
  let gaveUp = false;
  if (temporary && withinWindow) {
    const gap = Math.min(APPROVAL_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), APPROVAL_RETRY_MAX_GAP_MS);
    note =
      result.event === "still_launching"
        ? { kind: "starting", runId: run.id }
        : { kind: "failed", runId: run.id, reason: AUTO_RETRY_MESSAGES[code], retrying: true };
    // The run page shows the stored failure: say we retry, never "retry it yourself".
    if (result.event === "launch_failed") await rewordLaunchFailure(run.id, AUTO_RETRY_MESSAGES[code]).catch(() => {});
    await patchApprovalLaunch(run.id, {
      state: "retrying",
      note,
      nextAttemptAt: new Date(now.getTime() + gap).toISOString(),
      updatedAt: now.toISOString(),
    });
  } else if (temporary) {
    gaveUp = true;
    const reason = LAUNCH_FAILURE_MESSAGES[code];
    note = { kind: "failed", runId: run.id, reason };
    if (result.event === "launch_failed") await rewordLaunchFailure(run.id, reason).catch(() => {});
    await patchApprovalLaunch(run.id, { state: "done", note, nextAttemptAt: null, updatedAt: now.toISOString() });
  } else {
    note = approvalNoteFor(result);
    await patchApprovalLaunch(run.id, { state: "done", note, nextAttemptAt: null, updatedAt: now.toISOString() });
  }

  // The approval email goes out once, after the first attempt (whoever claims it sends it).
  if (record.emailPending && (await patchApprovalLaunch(run.id, { emailPending: false }, { emailPending: true }))) {
    await sendApprovalEmail(userId, {
      note,
      notStarted: record.notStarted,
      latestRunId: run.id,
      reapproved: record.reapproved,
    });
  } else if (gaveUp) {
    // The approval email promised we'd retry: say we stopped.
    const send = await systemMailer().catch(() => null);
    if (send) {
      const [user] = await getDb()
        .select({ email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1)
        .catch(() => [] as Array<{ email: string; name: string | null }>);
      if (user?.email) {
        await send({
          to: user.email,
          ...buildApprovalLaunchGaveUpEmail({ name: user.name, appUrl: process.env.APP_URL, runId: run.id }),
        }).catch((err: unknown) => console.error("[approval] gave-up email failed:", err instanceof Error ? err.message : err));
      }
    }
  }
  return note;
}

/**
 * The periodic half (called from the 5-minute background loop): approval
 * launches that are due, held by the 2-minute guard, retrying after a
 * temporary failure, or orphaned by a worker that died. Only for accounts that
 * are still approved. Never throws.
 */
export async function retryApprovalLaunches(now: Date = new Date()): Promise<{ tried: number }> {
  let tried = 0;
  try {
    const db = getDb();
    await ensureChadGtmTables(db);
    const cp = schema.chadGtmRuns.calibrationProfile;
    const due: Array<{ id: string; userId: string }> = await db
      .select({ id: schema.chadGtmRuns.id, userId: schema.chadGtmRuns.userId })
      .from(schema.chadGtmRuns)
      .where(
        and(
          eq(schema.chadGtmRuns.autopilot, true),
          isNull(schema.chadGtmRuns.campaignId),
          isNull(schema.chadGtmRuns.dismissedAt),
          sql`${cp}->'approvalLaunch'->>'state' in ('launching', 'retrying')`,
          sql`coalesce(${cp}->'approvalLaunch'->>'nextAttemptAt', '') <= ${now.toISOString()}`,
        ),
      )
      .limit(RETRY_BATCH);
    for (const row of due) {
      try {
        if ((await getSendAccess(row.userId)) !== "approved") {
          // Revoked since: stop. A later approval plans its own launch.
          await patchApprovalLaunch(row.id, { state: "done", note: { kind: "none" }, nextAttemptAt: null, updatedAt: now.toISOString() });
          continue;
        }
        tried += 1;
        await attemptApprovalLaunch(row.id, row.userId, now);
      } catch (err) {
        console.error("[approval] retry failed", { runId: row.id, error: err });
      }
    }
  } catch (err) {
    console.error("[approval] could not load approval launches to retry", err);
  }
  return { tried };
}

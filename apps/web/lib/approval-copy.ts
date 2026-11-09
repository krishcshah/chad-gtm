/**
 * Pending-approval copy. Only promise an approval email when the system mailer
 * is configured (SYSTEM_SMTP_*); otherwise approveUserAction sends nothing and
 * the client would wait for an email that never comes.
 *
 * Pure and client-safe: callers pass whether the mailer is configured.
 */

/** "we'll email you" / "You'll get an email when you're approved" style sentences or clauses. */
const EMAIL_PROMISE_SENTENCE = /\s*You['’]ll get an email when you['’]re approved\.?/gi;
const EMAIL_PROMISE_CLAUSE = /,?\s*and we['’]ll email you when we do\.?/gi;

/** Removes any approval-email promise from server-provided copy when no email will be sent. */
export function approvalCopy(text: string, emailOnApprove: boolean): string {
  if (emailOnApprove) return text;
  const stripped = text
    .replace(EMAIL_PROMISE_CLAUSE, ".")
    .replace(EMAIL_PROMISE_SENTENCE, "")
    .replace(/\.\.+/g, ".")
    .trim();
  return stripped;
}

/**
 * Body of the slim pending-approval banner shown across the app. Approval
 * launches one plan: the newest one that is ready (see launchAfterApproval).
 */
export function approvalBannerText(emailOnApprove: boolean): string {
  return emailOnApprove
    ? "Finish setting up now. Nothing sends until we approve your account. Once we do, your latest plan launches on its own and we'll email you."
    : "Finish setting up now. Nothing sends until we approve your account. Once we do, your latest plan launches on its own and this banner disappears.";
}

/** Title of the banner shown when an admin revoked sending for an account that was approved before. */
export const REVOKED_BANNER_TITLE = "Sending is paused by AutoGTM.";

/** Body of the revoked-sending banner. Never says "pending approval": this account was approved before. */
export function revokedBannerText(): string {
  return "Your campaigns are on hold and the agent is holding replies. Contact support to find out why and turn sending back on.";
}

/**
 * Body of the "Waiting for approval" launch panel. The global banner is the only
 * place that explains approval (and whether we'll email); the card only says
 * what it adds: the plan is ready and Launch is locked.
 */
export function awaitingApprovalText(): string {
  return AWAITING_APPROVAL_SHORT;
}

/**
 * Short "waiting for approval" line on a run waiting for approval. Approval
 * launches only the newest ready plan (touched in the last 14 days), so the
 * line says which one, and that any other plan needs Launch.
 */
export const AWAITING_APPROVAL_SHORT =
  "Your plan is ready. Once your account is approved, your newest plan launches on its own. Any other plan waits for you to press Launch.";

/** The campaign was linked but its final start failed. Matches the run page's button. */
export const LINKED_NOT_STARTED_MESSAGE =
  "Your campaign is set up but hasn't started. Press Resume outreach to start sending.";

/* ─── What approving an account launched ─────────────────────────────── */

export type MissingDetail = "bookingUrl" | "companyName" | "postalAddress";

/**
 * What approving an account did to its one waiting run (approval launches at
 * most one: the newest autopilot run whose only blocker was approval).
 * launching: queued, runs in the background. live: launched. starting:
 * another launch of it was in progress. details/research: still needs the
 * client. paused: set up but its final start failed. failed: tried and did
 * not start (retrying: we try again on our own). none: no run was waiting.
 */
export type ApprovalLaunchNote =
  | { kind: "none" }
  | { kind: "launching"; runId: string }
  | { kind: "live"; runId: string }
  | { kind: "starting"; runId: string }
  | { kind: "details"; runId: string; missing: MissingDetail[] }
  | { kind: "research"; runId: string }
  | { kind: "paused"; runId: string }
  | { kind: "failed"; runId?: string; reason?: string; retrying?: boolean };

/** A plan that was waiting too but that approval did not start (the email links to it). */
export interface NotStartedRun {
  runId: string;
  name: string;
}

/** One run's result after an approval launch attempt (from the session-free launcher). */
export interface ApprovalRunResult {
  runId: string;
  event: "launched" | "still_launching" | "blocked" | "launch_failed" | "linked_not_started" | "linked" | "error";
  phase?: string;
  missing?: MissingDetail[];
  reason?: string;
  /** The failure is temporary: the launch is retried automatically. */
  retrying?: boolean;
}

/** The note the admin and the client see for one launch attempt. */
export function approvalNoteFor(result: ApprovalRunResult): ApprovalLaunchNote {
  const runId = result.runId;
  switch (result.event) {
    case "launched":
    case "linked":
      return { kind: "live", runId };
    case "still_launching":
      return { kind: "starting", runId };
    case "linked_not_started":
      return { kind: "paused", runId };
    case "blocked":
      if (result.phase === "needs_details" && result.missing?.length) return { kind: "details", runId, missing: result.missing };
      if (result.phase === "needs_research") return { kind: "research", runId };
      return { kind: "failed", runId, reason: result.reason };
    default:
      return result.retrying
        ? { kind: "failed", runId, reason: result.reason, retrying: true }
        : { kind: "failed", runId, reason: result.reason };
  }
}

/** Failures an approval launch retries on its own, and how the run page words them meanwhile. */
export const AUTO_RETRY_MESSAGES = {
  no_senders:
    "All of our sending mailboxes are busy right now, so nothing has been sent. We'll retry the launch for you automatically.",
  error: "The launch didn't complete and nothing was sent. We'll retry it for you automatically.",
} as const;

/** "your booking link", "your company name and postal address", or both. */
export function missingDetailsText(missing: MissingDetail[]): string {
  const booking = missing.includes("bookingUrl");
  const identity = missing.includes("companyName") || missing.includes("postalAddress");
  const parts: string[] = [];
  if (booking) parts.push("your booking link");
  if (identity) parts.push("your company name and postal address");
  return parts.join(", and ") || "a few details";
}

/**
 * Admin toast after Approve. The launch runs in the background, so a launch
 * is "launching" here; the approvals list shows how it ended.
 */
export function approvalOutcomeText(
  note: ApprovalLaunchNote | null | undefined,
  reapproved = false,
  /** The account has a plan of its own (only matters when nothing was waiting). */
  hasRuns = false,
): string {
  switch (note?.kind) {
    case "launching":
      return "Approved. Launching their campaign now.";
    case "live":
      return "Approved. Their campaign is now live.";
    case "starting":
      return "Approved. Their campaign is starting.";
    case "details":
      return `Approved. Waiting for ${missingDetailsText(note.missing).replace(/\byour\b/g, "their")}.`;
    case "research":
      return "Approved. Their plan needs new research before it can launch.";
    case "paused":
      return "Approved. Their campaign is set up but hasn't started.";
    case "failed":
      return note.retrying
        ? "Approved. Their campaign didn't start yet. We'll retry it automatically."
        : "Approved, but their campaign didn't start. They can retry from their plan.";
    default:
      if (reapproved) return "Approved. Their campaigns can send again.";
      return hasRuns
        ? "Approved. Nothing was waiting to launch. They can launch their plan themselves."
        : "Approved. They haven't set up a campaign yet.";
  }
}

/* ─── Approval launch record (on the run) ─────────────────────────────── */

/**
 * Stored on the launched run as calibration_profile.approvalLaunch.
 * launching: queued (or held for the 2-minute guard). retrying: failed for a
 * temporary reason, tried again until 24 h after approval. done: final.
 */
export interface ApprovalLaunchRecord {
  state: "launching" | "retrying" | "done";
  note: ApprovalLaunchNote;
  /** When the account was approved: retries stop 24 h after this. */
  approvedAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  /** The approval email still has to go out (it is sent after the first attempt). */
  emailPending: boolean;
  reapproved: boolean;
  notStarted: NotStartedRun[];
  updatedAt: string;
}

/** Reads calibration_profile.approvalLaunch, or null when the run has none. */
export function readApprovalLaunch(calibrationProfile: unknown): ApprovalLaunchRecord | null {
  const raw = (calibrationProfile as { approvalLaunch?: unknown } | null | undefined)?.approvalLaunch ?? calibrationProfile;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ApprovalLaunchRecord>;
  if (r.state !== "launching" && r.state !== "retrying" && r.state !== "done") return null;
  if (!r.note || typeof r.note !== "object" || typeof (r.note as { kind?: unknown }).kind !== "string") return null;
  return {
    state: r.state,
    note: r.note as ApprovalLaunchNote,
    approvedAt: String(r.approvedAt || ""),
    attempts: Number(r.attempts) || 0,
    nextAttemptAt: r.nextAttemptAt ? String(r.nextAttemptAt) : null,
    emailPending: Boolean(r.emailPending),
    reapproved: Boolean(r.reapproved),
    notStarted: Array.isArray(r.notStarted) ? (r.notStarted as NotStartedRun[]) : [],
    updatedAt: String(r.updatedAt || ""),
  };
}

/** What the admin approvals list shows for an approved account's launch. */
export interface ApprovalLaunchView {
  status: "launching" | "live" | "waiting" | "retrying" | "failed" | "paused";
  label: string;
  /** Longer explanation (tooltip). */
  detail?: string;
  runId: string;
}

/** The approvals-list badge for a run's approval launch. The run's campaign wins: linked = live. */
export function approvalLaunchView(
  record: ApprovalLaunchRecord | null,
  run: { id: string; campaignId: string | null },
): ApprovalLaunchView | null {
  if (!record) return null;
  const runId = run.id;
  if (run.campaignId) {
    if (record.note.kind === "paused") return { status: "paused", label: "Set up, not started", detail: LINKED_NOT_STARTED_MESSAGE, runId };
    return { status: "live", label: "Live", runId };
  }
  if (record.state === "launching") return { status: "launching", label: "Launching", runId };
  if (record.state === "retrying") {
    const reason = record.note.kind === "failed" ? record.note.reason : undefined;
    return { status: "retrying", label: "Retrying launch", detail: reason, runId };
  }
  const note = record.note;
  switch (note.kind) {
    case "live":
      return { status: "live", label: "Live", runId };
    case "starting":
    case "launching":
      return { status: "launching", label: "Launching", runId };
    case "details":
      return { status: "waiting", label: "Waiting for details", detail: `Needs ${missingDetailsText(note.missing).replace(/\byour\b/g, "their")}.`, runId };
    case "research":
      return { status: "waiting", label: "Waiting for research", detail: "Their plan needs new research before it can launch.", runId };
    case "paused":
      return { status: "paused", label: "Set up, not started", detail: LINKED_NOT_STARTED_MESSAGE, runId };
    case "failed":
      return { status: "failed", label: "Launch failed", detail: note.reason, runId };
    default:
      return null;
  }
}

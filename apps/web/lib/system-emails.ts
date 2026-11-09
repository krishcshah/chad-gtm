/**
 * Copy for transactional emails sent through the system mailer
 * (@smartreach/email-engine/system-mailer). Pure functions, unit-tested.
 */

import {
  LINKED_NOT_STARTED_MESSAGE,
  missingDetailsText,
  type ApprovalLaunchNote,
  type NotStartedRun,
} from "./approval-copy";

export const SUPPORT_EMAIL = "support@autogtm.tech";

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function firstNameOf(name?: string | null): string {
  const first = String(name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

function paras(items: string[]): string {
  return items.map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`).join("");
}

function layout(
  paragraphs: string[],
  action?: { label: string; url: string },
  after: string[] = [],
  /** Already-escaped HTML placed after `after` (e.g. a list of links). */
  extraHtml = "",
): string {
  const body = paras(paragraphs);
  const button = action
    ? `<p style="margin:0 0 16px"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>` +
      `<p style="margin:0 0 16px;line-height:1.5;color:#71717a;font-size:12px">Or paste this link into your browser: ${escapeHtml(action.url)}</p>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#18181b;max-width:520px">${body}${button}${paras(after)}${extraHtml}<p style="margin:0;color:#71717a">— AutoGTM</p></div>`;
}

export function buildVerificationEmail(input: { name?: string | null; url: string }): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const intro = "Confirm your email to finish creating your AutoGTM account.";
  const note = "The link expires in 24 hours. If you didn't sign up, you can ignore this email.";
  return {
    subject: "Confirm your email for AutoGTM",
    text: `${hi}\n\n${intro}\n\n${input.url}\n\n${note}\n\n— AutoGTM`,
    html: layout([hi, intro], { label: "Confirm email", url: input.url }, [note]),
  };
}

export function buildPasswordResetEmail(input: { name?: string | null; url: string }): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const intro = "Someone asked to reset the password for your AutoGTM account.";
  const note = "The link expires in 1 hour. If it wasn't you, ignore this email and your password stays the same.";
  return {
    subject: "Reset your AutoGTM password",
    text: `${hi}\n\n${intro}\n\n${input.url}\n\n${note}\n\n— AutoGTM`,
    html: layout([hi, intro], { label: "Choose a new password", url: input.url }, [note]),
  };
}

/** Where the approval email sends the client: their latest autopilot run, else the launcher. */
export function approvalLaunchUrl(appUrl?: string | null, runId?: string | null): string {
  const base = String(appUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return "";
  const id = String(runId ?? "").trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? `${base}/chad-gtm/${id}` : `${base}/chad-gtm`;
}

/** The approval email's paragraph and button for what approving launched (or what is left). */
function launchNoteCopy(
  note: ApprovalLaunchNote,
): { line: string; label: string; runId?: string; live: boolean } | null {
  switch (note.kind) {
    case "live":
      return {
        line: "Your campaign is live. The agent is emailing your prospects and will book interested ones on your calendar. You don't need to do anything.",
        label: "See your campaign",
        runId: note.runId,
        live: true,
      };
    case "launching":
    case "starting":
      // Not live yet: the launch may still fail, so never the "is live" subject.
      return {
        line: "Your campaign is starting now. The agent will email your prospects and book interested ones on your calendar. You don't need to do anything.",
        label: "See your campaign",
        runId: note.runId,
        live: false,
      };
    case "details": {
      const what = missingDetailsText(note.missing);
      const booking = note.missing.length === 1 && note.missing[0] === "bookingUrl";
      return {
        // Saved on the plan page, the plan launches on its own (Settings does not start it).
        line: `One thing left before your campaign starts: add ${what}${booking ? " (where interested leads book a call with you)" : ""}. Add ${booking ? "it" : "them"} on your plan page and your campaign starts on its own.`,
        label: booking ? "Add your booking link" : "Add your details",
        runId: note.runId,
        live: false,
      };
    }
    case "research":
      return {
        line: "One thing left before your campaign starts: we couldn't tell who to email from your website. Open your plan and retry the research with a short note about who you sell to.",
        label: "Open your plan",
        runId: note.runId,
        live: false,
      };
    case "paused":
      return { line: LINKED_NOT_STARTED_MESSAGE, label: "Open your plan", runId: note.runId, live: false };
    case "failed": {
      const fallback = note.retrying
        ? "Nothing has been sent. We'll retry the launch for you automatically."
        : "Nothing has been sent. Open your plan and press Retry launch.";
      return {
        line: `Your campaign didn't start yet. ${note.reason?.trim() || fallback}`,
        label: "Open your plan",
        runId: note.runId,
        live: false,
      };
    }
    case "none":
      return {
        line: "Nothing has been sent yet. Enter your website in AutoGTM: we research it, write your campaign and launch it for you.",
        label: "Open AutoGTM",
        live: false,
      };
  }
}

/**
 * Other waiting plans approval did not start: one line each, with a link to
 * open and launch it. Never the plan the email's button already opens.
 * "We didn't start your other plan" only when approval started one.
 */
function notStartedCopy(
  appUrl: string | null | undefined,
  runs: NotStartedRun[] | null | undefined,
  opts: { mainRunId?: string | null; startedOne: boolean },
): { text: string; html: string } {
  const main = String(opts.mainRunId ?? "").trim();
  const list = (runs ?? []).filter((r) => r && r.runId && r.runId !== main).slice(0, 5);
  if (list.length === 0) return { text: "", html: "" };
  const intro = opts.startedOne
    ? list.length === 1
      ? "We didn't start your other plan. Open it to launch it:"
      : "We didn't start your other plans. Open one to launch it:"
    : list.length === 1
      ? "You have another plan ready. Open it to launch it:"
      : "You have other plans ready. Open one to launch it:";
  const items = list.map((r) => ({ name: String(r.name || "").trim() || "Your plan", url: approvalLaunchUrl(appUrl, r.runId) }));
  const text = [intro, ...items.map((i) => (i.url ? `- ${i.name}: ${i.url}` : `- ${i.name}`))].join("\n");
  const html =
    `<p style="margin:0 0 8px;line-height:1.5">${escapeHtml(intro)}</p>` +
    `<ul style="margin:0 0 16px;padding-left:20px;line-height:1.5">${items
      .map((i) => (i.url ? `<li><a href="${escapeHtml(i.url)}">${escapeHtml(i.name)}</a></li>` : `<li>${escapeHtml(i.name)}</li>`))
      .join("")}</ul>`;
  return { text, html };
}

/**
 * Sent when an admin approves an account, after the approval launch was tried.
 * Approval launches at most one run (`launch`), so the email says the campaign
 * is live, or the one thing left to do, and lists any other waiting plans it
 * did not start (`notStarted`). With no launch note, or "none" while the
 * client has a run (`runId`), the client is sent to that run to launch it.
 */
export function buildApprovalEmail(input: {
  name?: string | null;
  appUrl?: string | null;
  runId?: string | null;
  /** Lead conversations held while the account was on hold; they open in Needs you. */
  waitingCount?: number | null;
  /** The account was approved before and put on hold; its campaigns already sent. */
  reapproved?: boolean | null;
  /** What approving launched; see ApprovalLaunchNote. */
  launch?: ApprovalLaunchNote | null;
  /** Other waiting plans approval did not start. */
  notStarted?: NotStartedRun[] | null;
}): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const intro = "Your AutoGTM account is approved.";
  const waiting = heldWaitingText(input.waitingCount);
  const resumed = Boolean(input.reapproved || waiting);
  // "none" with a run of theirs: the "open your plan and launch" email below, never "enter your website".
  const noneWithRun = input.launch?.kind === "none" && Boolean(String(input.runId ?? "").trim());
  // A re-approved account with nothing new waiting keeps the "campaigns can send again" email below.
  const note =
    input.launch && !(input.launch.kind === "none" && (resumed || noneWithRun)) ? launchNoteCopy(input.launch) : null;
  const kind = input.launch?.kind;
  const others = notStartedCopy(input.appUrl, input.notStarted, {
    // The plan the button opens is never listed again as "other".
    mainRunId: note ? note.runId : input.runId,
    startedOne: kind === "live" || kind === "launching" || kind === "starting" || kind === "paused" || kind === "failed",
  });
  const withOthers = (text: string) => (others.text ? `${text}\n\n${others.text}` : text);
  if (note) {
    const body = [intro, ...(resumed ? ["Your running campaigns can send again."] : []), note.line, ...(waiting ? [waiting] : [])];
    const url = approvalLaunchUrl(input.appUrl, note.runId);
    const cta = url ? `${note.label}: ${url}` : "Sign in to AutoGTM to see your campaign.";
    return {
      subject: note.live ? "Your AutoGTM campaign is live" : "Your AutoGTM account is approved",
      text: `${hi}\n\n${withOthers(`${body.join("\n\n")}\n\n${cta}`)}\n\n— AutoGTM`,
      html: url
        ? layout([hi, ...body], { label: note.label, url }, [], others.html)
        : layout([hi, ...body, cta], undefined, [], others.html),
    };
  }
  // Held lead conversations mean campaigns already sent, so "nothing has been sent" would be false.
  if (input.reapproved || waiting) {
    const next = "Your running campaigns can send again.";
    const base = String(input.appUrl ?? "").trim().replace(/\/+$/, "");
    const url = base ? (waiting ? `${base}/requests` : `${base}/dashboard`) : "";
    const label = waiting ? "Open Needs you" : "Open AutoGTM";
    const cta = url ? `${label}: ${url}` : "Sign in to AutoGTM to see your campaigns.";
    const body = waiting ? [intro, next, waiting] : [intro, next];
    return {
      subject: "Your AutoGTM account is approved",
      text: `${hi}\n\n${withOthers(`${body.join("\n\n")}\n\n${cta}`)}\n\n— AutoGTM`,
      html: url
        ? layout([hi, ...body], { label, url }, [], others.html)
        : layout([hi, ...body, cta], undefined, [], others.html),
    };
  }
  const next = "Nothing has been sent yet. Open AutoGTM to review your plan and launch your campaign.";
  const url = approvalLaunchUrl(input.appUrl, input.runId);
  const cta = url ? `Launch your campaign: ${url}` : "Sign in to AutoGTM to launch your campaign.";
  return {
    subject: "Your AutoGTM account is approved",
    text: `${hi}\n\n${withOthers(`${intro}\n\n${next}\n\n${cta}`)}\n\n— AutoGTM`,
    html: url
      ? layout([hi, intro, next], { label: "Open AutoGTM to launch", url }, [], others.html)
      : layout([hi, intro, next, cta], undefined, [], others.html),
  };
}

/**
 * Sent when an approval launch kept failing for a temporary reason and we
 * stopped retrying it (24 h after approval). The client has to act now.
 */
export function buildApprovalLaunchGaveUpEmail(input: {
  name?: string | null;
  appUrl?: string | null;
  runId?: string | null;
}): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const line =
    "We tried to start your campaign for a day, but it still didn't start. Nothing has been sent. Open your plan and press Retry launch.";
  const url = approvalLaunchUrl(input.appUrl, input.runId);
  const cta = url ? `Open your plan: ${url}` : "Sign in to AutoGTM to retry your launch.";
  return {
    subject: "Your AutoGTM campaign didn't start",
    text: `${hi}\n\n${line}\n\n${cta}\n\n— AutoGTM`,
    html: url ? layout([hi, line], { label: "Open your plan", url }) : layout([hi, line, cta]),
  };
}

/** "3 lead conversations arrived while your account was on hold. …", or "" when none. */
export function heldWaitingText(count?: number | null): string {
  const n = Math.floor(Number(count ?? 0));
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n} lead ${n === 1 ? "conversation" : "conversations"} arrived while your account was on hold. They're waiting for you in Needs you.`;
}

/** Where the signup alert sends admins: the approvals list. */
export function adminApprovalsUrl(appUrl?: string | null): string {
  const base = String(appUrl ?? "").trim().replace(/\/+$/, "");
  return base ? `${base}/admin?tab=approvals` : "";
}

/** Sent to admins when someone signs up and must be approved before they can send. */
export function buildSignupAlertEmail(input: {
  name?: string | null;
  email: string;
  appUrl?: string | null;
  website?: string | null;
}): BuiltEmail {
  const who = String(input.name ?? "").trim();
  const label = who ? `${who} (${input.email})` : input.email;
  const intro = `${label} just signed up for AutoGTM and is waiting for approval.`;
  const site = String(input.website ?? "").trim();
  const lines = [intro, ...(site ? [`Website: ${site}`] : []), "Once you approve them, their latest ready plan launches on its own."];
  const url = adminApprovalsUrl(input.appUrl);
  const cta = url ? `Review it: ${url}` : "Open the admin console to review it.";
  return {
    subject: `New AutoGTM signup: ${input.email}`,
    text: `${lines.join("\n\n")}\n\n${cta}\n\n— AutoGTM`,
    html: url ? layout(lines, { label: "Review signup", url }) : layout([...lines, cta]),
  };
}

/**
 * For auth.ts emailAndPassword.onExistingUserSignUp: someone signed up with an
 * address that already has an account. Keeps enumeration protection (the
 * sign-up page looks the same) while telling the owner how to get in.
 */
export function buildExistingAccountEmail(input: { name?: string | null; appUrl?: string | null }): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const intro = "Someone tried to create an AutoGTM account with this email address, but you already have one.";
  const base = String(input.appUrl ?? "").trim().replace(/\/+$/, "");
  const signIn = base ? `${base}/login` : "";
  const reset = base ? `${base}/forgot-password` : "";
  const how = signIn
    ? `Sign in at ${signIn}. Forgot your password? Reset it at ${reset}.`
    : "Sign in to AutoGTM, or use \"Forgot password\" on the sign-in page.";
  const note = "If it wasn't you, you can ignore this email. Your account hasn't changed.";
  return {
    subject: "You already have an AutoGTM account",
    text: `${hi}\n\n${intro}\n\n${how}\n\n${note}\n\n— AutoGTM`,
    html: signIn
      ? layout([hi, intro], { label: "Sign in", url: signIn }, [`Forgot your password? Reset it at ${reset}.`, note])
      : layout([hi, intro, how, note]),
  };
}

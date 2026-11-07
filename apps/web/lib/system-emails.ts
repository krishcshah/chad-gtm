/**
 * Copy for transactional emails sent through the system mailer
 * (@smartreach/email-engine/system-mailer). Pure functions, unit-tested.
 */

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

function layout(paragraphs: string[], action?: { label: string; url: string }, after: string[] = []): string {
  const body = paras(paragraphs);
  const button = action
    ? `<p style="margin:0 0 16px"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>` +
      `<p style="margin:0 0 16px;line-height:1.5;color:#71717a;font-size:12px">Or paste this link into your browser: ${escapeHtml(action.url)}</p>`
    : "";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#18181b;max-width:520px">${body}${button}${paras(after)}<p style="margin:0;color:#71717a">— AutoGTM</p></div>`;
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

/**
 * Sent when an admin approves an account. Approval does not launch anything:
 * the client still opens their run and clicks "Launch outreach", so the copy
 * says exactly that and links to the run (or the launcher).
 */
export function buildApprovalEmail(input: {
  name?: string | null;
  appUrl?: string | null;
  runId?: string | null;
  /** Lead conversations held while the account was on hold; they open in Needs you. */
  waitingCount?: number | null;
  /** The account was approved before and put on hold; its campaigns already sent. */
  reapproved?: boolean | null;
}): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const intro = "Your AutoGTM account is approved.";
  const waiting = heldWaitingText(input.waitingCount);
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
      text: `${hi}\n\n${body.join("\n\n")}\n\n${cta}\n\n— AutoGTM`,
      html: url ? layout([hi, ...body], { label, url }) : layout([hi, ...body, cta]),
    };
  }
  const next = "Nothing has been sent yet. Open AutoGTM to review your plan and launch your campaign.";
  const url = approvalLaunchUrl(input.appUrl, input.runId);
  const cta = url ? `Launch your campaign: ${url}` : "Sign in to AutoGTM to launch your campaign.";
  return {
    subject: "Your AutoGTM account is approved",
    text: `${hi}\n\n${intro}\n\n${next}\n\n${cta}\n\n— AutoGTM`,
    html: url
      ? layout([hi, intro, next], { label: "Open AutoGTM to launch", url })
      : layout([hi, intro, next, cta]),
  };
}

/** "3 lead conversations arrived while your account was on hold. …", or "" when none. */
export function heldWaitingText(count?: number | null): string {
  const n = Math.floor(Number(count ?? 0));
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n} lead ${n === 1 ? "conversation" : "conversations"} arrived while your account was on hold. They're waiting for you in Needs you.`;
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

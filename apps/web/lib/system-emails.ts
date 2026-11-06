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

export function buildApprovalEmail(input: { name?: string | null; appUrl?: string | null }): BuiltEmail {
  const hi = `Hi ${firstNameOf(input.name)},`;
  const intro = "Your AutoGTM account is approved. Your campaigns can now send.";
  const base = String(input.appUrl ?? "").trim().replace(/\/+$/, "");
  const url = base ? `${base}/dashboard` : "";
  const cta = url ? `Open AutoGTM: ${url}` : "Sign in to AutoGTM to launch your campaign.";
  return {
    subject: "Your AutoGTM account is approved",
    text: `${hi}\n\n${intro}\n\n${cta}\n\n— AutoGTM`,
    html: url ? layout([hi, intro], { label: "Open AutoGTM", url }) : layout([hi, intro, cta]),
  };
}

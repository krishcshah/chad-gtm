/**
 * Tells the admins when someone signs up and needs approval before sending.
 * Called from better-auth's emailVerification.afterEmailVerification hook
 * (lib/auth.ts), so only verified addresses alert anyone. Never throws and
 * never delays verification: the send runs in the background.
 */
import { eq } from "drizzle-orm";
import { schema } from "@smartreach/database";
import { getAdminEmails } from "./admin";
import { approvalRequired } from "./approval";
import { buildSignupAlertEmail, type BuiltEmail } from "./system-emails";

export interface SignupUser {
  email?: string | null;
  name?: string | null;
  role?: unknown;
  /** Set once approved: an approved user verifying a changed address is not a new signup. */
  approvedAt?: unknown;
}

export interface SignupNotifyDeps {
  mailerConfigured: () => boolean;
  send: (mail: { to: string } & BuiltEmail) => Promise<unknown>;
  /** users.role = 'admin' addresses (ADMIN_EMAILS is added on top). */
  adminRoleEmails: () => Promise<string[]>;
  approvalRequired: () => boolean;
  appUrl?: string | null;
  env?: Record<string, string | undefined>;
}

async function defaultDeps(): Promise<SignupNotifyDeps> {
  const { isSystemMailerConfigured, sendSystemEmail } = await import("@smartreach/email-engine/system-mailer");
  return {
    mailerConfigured: isSystemMailerConfigured,
    send: (mail) => sendSystemEmail(mail),
    adminRoleEmails: async () => {
      const { getDb } = await import("./db");
      const rows = await getDb()
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.role, "admin"));
      return rows.map((r) => r.email);
    },
    approvalRequired,
    appUrl: process.env.APP_URL,
  };
}

/** Admin addresses to alert: ADMIN_EMAILS plus admin-role users, never the new user. */
export async function signupAlertRecipients(user: SignupUser, deps: SignupNotifyDeps): Promise<string[]> {
  const fromRole = await deps.adminRoleEmails().catch((err) => {
    console.error("[signup-notify] admin lookup failed:", err instanceof Error ? err.message : err);
    return [] as string[];
  });
  const self = String(user.email ?? "").trim().toLowerCase();
  const out: string[] = [];
  for (const raw of [...getAdminEmails(deps.env ?? process.env), ...fromRole]) {
    const email = String(raw ?? "").trim().toLowerCase();
    if (email && email !== self && !out.includes(email)) out.push(email);
  }
  return out;
}

/** Emails each admin once. Returns how many alerts were sent. */
export async function notifyAdminsOfSignup(user: SignupUser, depsIn?: SignupNotifyDeps): Promise<number> {
  const email = String(user.email ?? "").trim();
  if (!email || user.role === "admin" || user.approvedAt) return 0;
  const deps = depsIn ?? (await defaultDeps());
  if (!deps.approvalRequired() || !deps.mailerConfigured()) return 0;
  const to = await signupAlertRecipients(user, deps);
  if (to.length === 0) return 0;
  const mail = buildSignupAlertEmail({ name: user.name, email, appUrl: deps.appUrl });
  let sent = 0;
  for (const addr of to) {
    try {
      await deps.send({ to: addr, ...mail });
      sent += 1;
    } catch (err) {
      console.error(`[signup-notify] alert to ${addr} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

/** For the better-auth hook: start the alert and return at once. */
export function notifyAdminsOfSignupInBackground(user: SignupUser, deps?: SignupNotifyDeps): void {
  try {
    void notifyAdminsOfSignup(user, deps).catch((err) => {
      console.error("[signup-notify] failed:", err instanceof Error ? err.message : err);
    });
  } catch (err) {
    console.error("[signup-notify] failed:", err instanceof Error ? err.message : err);
  }
}

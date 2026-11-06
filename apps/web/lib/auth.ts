import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { schema } from "@smartreach/database";
import { lazyDb } from "./db";
import { env } from "./env";
import { resolveTrustedOrigins } from "./auth-trusted-origins";
import { isSystemMailerConfigured, sendSystemEmail } from "@smartreach/email-engine/system-mailer";
import { buildPasswordResetEmail, buildVerificationEmail } from "./system-emails";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-rules";

/**
 * Better Auth — email/password sessions. The adapter points at the same Neon
 * database; the `user/session/account/verification` tables live in schema-auth.
 * better-auth's Drizzle adapter looks up SINGULAR model keys, so we map our
 * plural-named tables (`users` → `user`, etc.) explicitly.
 */
const authSchema = {
  ...schema,
  user: schema.users,
  session: schema.sessions,
  account: schema.accounts,
  verification: schema.verifications,
};

/** APP_URL + BETTER_AUTH_URL (+ optional CSV), with localhost↔127.0.0.1 twins. */
const trustedOrigins = resolveTrustedOrigins({
  appUrl: env.APP_URL,
  betterAuthUrl: env.BETTER_AUTH_URL,
  extraCsv: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
  // Dev/test always accept both loopback hosts so smoke/curl on 127.0.0.1 works
  // even when APP_URL defaults to http://localhost:3000. Production only trusts
  // configured URLs (and their loopback twin if the configured host is loopback).
  includeDevLoopback: env.NODE_ENV !== "production",
});

/**
 * Email verification and password reset need a transactional sender
 * (SYSTEM_SMTP_* + SYSTEM_EMAIL_FROM). Without one, sign-up keeps working
 * without verification and the UI says "contact support" for resets.
 */
export const systemMailerEnabled = isSystemMailerConfigured();

/**
 * Fire-and-forget: better-auth's responses must not reveal (by timing) whether
 * an address has an account, and a slow SMTP server must not stall sign-up.
 * The web process is long-running, so the send completes in the background.
 */
function sendInBackground(kind: string, to: string, email: { subject: string; text: string; html: string }) {
  void sendSystemEmail({ to, ...email }).catch((err) => {
    console.error(`[auth] ${kind} email to ${to} failed:`, err instanceof Error ? err.message : err);
  });
}

export const auth = betterAuth({
  appName: "AutoGTM",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(lazyDb(), { provider: "pg", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    autoSignIn: !systemMailerEnabled,
    requireEmailVerification: systemMailerEnabled,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    ...(systemMailerEnabled
      ? {
          sendResetPassword: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
            sendInBackground("password reset", user.email, buildPasswordResetEmail({ name: user.name, url }));
          },
        }
      : {}),
  },
  ...(systemMailerEnabled
    ? {
        emailVerification: {
          sendOnSignUp: true,
          // Unverified users who try to sign in get a fresh link.
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          expiresIn: 60 * 60 * 24, // 24 hours
          sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
            sendInBackground("verification", user.email, buildVerificationEmail({ name: user.name, url }));
          },
        },
      }
    : {}),
  user: {
    // Expose role/approval on the session user. input:false keeps them out of
    // sign-up/update payloads, so a client can never set its own role.
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
      approvedAt: { type: "date", required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days
    updateAge: 60 * 60 * 24, // refresh daily
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
  plugins: [nextCookies()],
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;

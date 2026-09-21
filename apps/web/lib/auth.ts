import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { schema } from "@smartreach/database";
import { getDb } from "./db";
import { env } from "./env";
import { resolveTrustedOrigins } from "./auth-trusted-origins";

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

export const auth = betterAuth({
  appName: "SmartReach",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
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
      "/forget-password": { window: 60, max: 5 },
    },
  },
  plugins: [nextCookies()],
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;

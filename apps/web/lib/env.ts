import { z } from "zod";

/**
 * Central, validated environment. Every secret access goes through here so a
 * misconfigured deployment fails loudly at startup instead of at send time.
 */
function sanitizeUrl(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const cleaned = val.trim().replace(/^["']|["']$/g, "");
  try {
    new URL(cleaned);
    return cleaned;
  } catch {
    return fallback;
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 chars"),
  BETTER_AUTH_URL: z
    .string()
    .transform((val) => sanitizeUrl(val, "http://localhost:3000")),
  APP_URL: z
    .string()
    .transform((val) => sanitizeUrl(val, "http://localhost:3000")),
  /** 64 hex chars (32 bytes) — encrypts SMTP/IMAP credentials at rest. */
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters")
    .default("0".repeat(64)),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse(process.env);

/**
 * `next build` evaluates modules without live secrets (`NEXT_PHASE` or the
 * npm `build` lifecycle). Placeholder fallback is allowed only then so the
 * build can finish. At production runtime a failed parse must throw: silently
 * substituting a localhost/placeholder `DATABASE_URL` masks real credential
 * failures as empty HTTP 500s.
 */
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

const devFallback = () =>
  envSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/smartreach",
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "dev-secret-do-not-use-in-prod-0000",
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    APP_URL: process.env.APP_URL ?? "http://localhost:3000",
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? "0".repeat(64),
    NODE_ENV: process.env.NODE_ENV ?? "development",
  });

export const env = parsed.success
  ? parsed.data
  : (() => {
      if (process.env.NODE_ENV === "production" && !isBuildPhase) {
        const fieldErrors = parsed.error.flatten().fieldErrors;
        console.error("Invalid production environment variables:", fieldErrors);
        throw parsed.error;
      }
      return devFallback();
    })();

/** True when a real (non-placeholder) DATABASE_URL is configured. */
export const isDbConfigured = Boolean(process.env.DATABASE_URL);

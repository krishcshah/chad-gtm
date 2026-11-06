/**
 * System mailer — transactional mail sent BY AutoGTM (verification links,
 * password resets, approval notices, "your agent needs you").
 *
 * This is deliberately separate from the cold-outreach pool (mailer.ts): it
 * uses its own SMTP account and a neutral From address, never a pool persona.
 *
 * Env:
 *   SYSTEM_SMTP_HOST     required
 *   SYSTEM_SMTP_PORT     default 587 (465 implies implicit TLS)
 *   SYSTEM_SMTP_SECURE   "true" = implicit TLS, "false" = STARTTLS; default: port === 465
 *   SYSTEM_SMTP_USER     optional (with PASS)
 *   SYSTEM_SMTP_PASS     optional (with USER)
 *   SYSTEM_EMAIL_FROM    required, e.g. "AutoGTM <notify@autogtm.tech>"
 *
 * TLS certificates are always verified.
 */
import nodemailer from "nodemailer";

type Env = Record<string, string | undefined>;

export interface SystemMailerConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface SystemEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function clean(value: string | undefined): string {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

/** Parses SYSTEM_SMTP_* / SYSTEM_EMAIL_FROM; null when not (validly) configured. */
export function readSystemMailerConfig(env: Env = process.env): SystemMailerConfig | null {
  const host = clean(env.SYSTEM_SMTP_HOST);
  const from = clean(env.SYSTEM_EMAIL_FROM);
  if (!host || !from) return null;

  const portRaw = clean(env.SYSTEM_SMTP_PORT);
  const port = portRaw ? Number(portRaw) : 587;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  const secureRaw = clean(env.SYSTEM_SMTP_SECURE).toLowerCase();
  const secure = secureRaw === "true" ? true : secureRaw === "false" ? false : port === 465;

  const user = clean(env.SYSTEM_SMTP_USER) || undefined;
  const pass = env.SYSTEM_SMTP_PASS ? String(env.SYSTEM_SMTP_PASS) : undefined;
  // Half-configured auth is a misconfiguration, not "no auth".
  if (Boolean(user) !== Boolean(pass)) return null;

  return { host, port, secure, user, pass, from };
}

export function isSystemMailerConfigured(env: Env = process.env): boolean {
  return readSystemMailerConfig(env) !== null;
}

/** nodemailer transport options for the system account (exported for tests). */
export function systemTransportOptions(config: SystemMailerConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Never send credentials over plaintext: require STARTTLS when not implicit TLS.
    requireTLS: !config.secure && Boolean(config.user),
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { rejectUnauthorized: true },
  };
}

/**
 * Sends one transactional email from SYSTEM_EMAIL_FROM.
 * Throws when the mailer is not configured or the SMTP send fails.
 */
export async function sendSystemEmail(
  email: SystemEmail,
  env: Env = process.env,
): Promise<{ messageId: string }> {
  const config = readSystemMailerConfig(env);
  if (!config) throw new Error("System mailer is not configured (SYSTEM_SMTP_HOST / SYSTEM_EMAIL_FROM).");
  const to = String(email.to ?? "").trim();
  if (!to) throw new Error("sendSystemEmail: missing recipient.");

  const transporter = nodemailer.createTransport(systemTransportOptions(config) as any);
  try {
    const info = await transporter.sendMail({
      from: config.from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html || undefined,
    });
    return { messageId: String(info?.messageId ?? "") };
  } finally {
    transporter.close();
  }
}

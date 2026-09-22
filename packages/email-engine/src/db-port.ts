/**
 * The engine works against any Drizzle instance whose schema is
 * @smartreach/database (better-sqlite3 locally, Neon HTTP on Workers).
 * We type it loosely here to avoid a hard dependency on driver generics.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EngineDb = any;

/** Loose row types used across the engine. */
export interface SenderRow {
  id: string;
  userId: string;
  senderName: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPasswordEnc: string;
  smtpSecurity: "tls" | "ssl" | "none";
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  imapPasswordEnc: string;
  dailyLimit: number;
  hourlyLimit: number;
  fromName: string;
  replyTo: string;
  timezone: string;
  signature: string;
  status: "active" | "paused" | "failed";
  health: number;
  smtpStatus: "untested" | "ok" | "failed";
  imapStatus: "untested" | "ok" | "failed";
  lastSyncAt: string | null;
  repliedCount: number;
}

export interface CampaignRow {
  id: string;
  userId: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "paused" | "completed" | "archived";
  leadListId: string | null;
  templateId: string | null;
  scheduledAt: string | null;
  businessDaysOnly: boolean;
  sendingTimezone: string;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  dailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  maxEmailsPerSenderPerDay: number;
  stopOnReply: boolean;
  retryFailed: boolean;
  retryCount: number;
  lastSenderIdx: number;
  senderCapUntil: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface JobRow {
  id: string;
  campaignId: string;
  campaignLeadId: string;
  senderId: string;
  leadId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  stepPosition: number;
  sequenceStepId: string | null;
  variantId: string | null;
  status: "pending" | "processing" | "sent" | "failed" | "retry" | "bounced" | "cancelled";
  scheduledFor: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  messageId: string | null;
  sentAt: string | null;
  processingAt: string | null;
  dryRun: boolean;
}

export const APP_NAME = "SmartReach";
export const APP_TAGLINE = "Everything you need. Nothing you don't.";

export const LEAD_STATUSES = [
  "pending",
  "queued",
  "sent",
  "replied",
  "bounced",
  "failed",
  "completed",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Unibox inbound reply disposition tags (F03 / tip 0008). */
export const UNIBOX_REPLY_TAGS = [
  "out_of_office",
  "not_interested",
  "interested",
  "meeting_booked",
  "won",
  "lost",
] as const;
export type UniboxReplyTag = (typeof UNIBOX_REPLY_TAGS)[number];

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "running",
  "paused",
  "completed",
  "archived",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const SENDER_STATUSES = ["active", "paused", "failed"] as const;
export type SenderStatus = (typeof SENDER_STATUSES)[number];

export const JOB_STATUSES = [
  "pending",
  "processing",
  "sent",
  "failed",
  "retry",
  "bounced",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const CONNECTION_STATUSES = ["untested", "ok", "failed"] as const;

/** Standard lead fields offered on the CSV mapping screen. Everything else
 *  becomes a custom merge variable. */
export const STANDARD_LEAD_FIELDS = [
  { key: "email", label: "Email", required: true },
  { key: "first_name", label: "First Name", required: false },
  { key: "last_name", label: "Last Name", required: false },
  { key: "company", label: "Company", required: false },
  { key: "website", label: "Website", required: false },
  { key: "linkedin", label: "LinkedIn", required: false },
  { key: "job_title", label: "Job Title", required: false },
  { key: "location", label: "Location", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "industry", label: "Industry", required: false },
] as const;

export const DEFAULTS = {
  /** Campaign */
  minDelaySec: 90,
  maxDelaySec: 240,
  dailyCampaignLimit: 100,
  maxEmailsPerSenderPerDay: 50,
  sendingWindowStart: "09:00",
  sendingWindowEnd: "17:00",
  sendingTimezone: "UTC",
  retryCount: 3,
  /** Sender */
  senderDailyLimit: 50,
  senderHourlyLimit: 10,
  /** Engine */
  engineIntervalMs: 30_000,
  engineSyncMs: 120_000,
  engineBatchSize: 25,
} as const;

export const SENDER_IMPORT_COLUMNS = [
  "Sender Name",
  "Email",
  "SMTP Host",
  "SMTP Port",
  "SMTP Username",
  "SMTP Password",
  "SMTP Security",
  "IMAP Host",
  "IMAP Port",
  "IMAP Username",
  "IMAP Password",
  "Daily Limit",
  "Hourly Limit",
  "Timezone",
  "Signature",
] as const;

export const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Amsterdam",
  "Europe/Warsaw",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

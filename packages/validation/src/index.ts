import { DEFAULTS, TIMEZONES } from "@smartreach/shared";
import { z } from "zod";

/* ─── Auth ─────────────────────────────────────────────────────────────── */

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

/* ─── Leads ────────────────────────────────────────────────────────────── */

export const leadListCreateSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(120),
});

export const leadTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#6366f1"),
});

/** Mapping of CSV column name → field key (standard field or custom key). */
export const columnMappingSchema = z.record(z.string(), z.string().nullable());

export const leadImportSchema = z.object({
  listId: z.string().min(1),
  listName: z.string().trim().max(120).optional(),
  mapping: columnMappingSchema,
  rows: z.array(z.record(z.string(), z.string())).min(1, "CSV has no rows").max(50_000),
});

export const leadUpdateSchema = z.object({
  email: z.string().trim().email().optional(),
  firstName: z.string().trim().max(120).nullish(),
  lastName: z.string().trim().max(120).nullish(),
  company: z.string().trim().max(160).nullish(),
  website: z.string().trim().max(255).nullish(),
  linkedin: z.string().trim().max(255).nullish(),
  jobTitle: z.string().trim().max(120).nullish(),
  location: z.string().trim().max(160).nullish(),
  phone: z.string().trim().max(60).nullish(),
  industry: z.string().trim().max(120).nullish(),
  tags: z.array(z.string()).optional(),
});

export const leadListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(200).optional(),
  status: z
    .enum(["pending", "queued", "sent", "replied", "bounced", "failed", "completed"])
    .optional(),
  listId: z.string().optional(),
  tagId: z.string().optional(),
  sortBy: z.enum(["email", "firstName", "company", "createdAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;

/* ─── Sender accounts ──────────────────────────────────────────────────── */

const port = z.coerce.number().int().min(1).max(65535);

export const senderCreateSchema = z.object({
  senderName: z.string().trim().min(1, "Sender name is required").max(120),
  email: z.string().trim().email("Enter a valid sender email").max(255),
  smtpHost: z.string().trim().min(1, "SMTP host is required").max(255),
  smtpPort: port.default(587),
  smtpUsername: z.string().trim().min(1, "SMTP username is required").max(255),
  smtpPassword: z.string().min(1, "SMTP password is required").max(255),
  smtpSecurity: z.enum(["tls", "ssl", "none"]).default("tls"),
  imapHost: z.string().trim().max(255).default(""),
  imapPort: port.default(993),
  imapUsername: z.string().trim().max(255).default(""),
  imapPassword: z.string().max(255).default(""),
  dailyLimit: z.coerce.number().int().min(1).max(5000).default(DEFAULTS.senderDailyLimit),
  hourlyLimit: z.coerce.number().int().min(1).max(1000).default(DEFAULTS.senderHourlyLimit),
  fromName: z.string().trim().max(120).default(""),
  replyTo: z.string().trim().email().max(255).or(z.literal("")).default(""),
  timezone: z
    .string()
    .refine((v) => !v || (TIMEZONES as readonly string[]).includes(v), "Unknown timezone")
    .default("UTC"),
  signature: z.string().max(5000).default(""),
});
export type SenderCreateInput = z.infer<typeof senderCreateSchema>;

export const senderUpdateSchema = senderCreateSchema.partial().extend({
  status: z.enum(["active", "paused", "failed"]).optional(),
  smtpPassword: z.string().max(255).optional(), // empty string = keep existing
  imapPassword: z.string().max(255).optional(),
});

export const senderCsvRowSchema = z.object({
  senderName: z.string().trim().min(1, "Sender Name is required"),
  email: z.string().trim().email("Invalid email"),
  smtpHost: z.string().trim().min(1, "SMTP Host is required"),
  smtpPort: port.default(587),
  smtpUsername: z.string().trim().min(1, "SMTP Username is required"),
  smtpPassword: z.string().min(1, "SMTP Password is required"),
  smtpSecurity: z.enum(["tls", "ssl", "none"]).default("tls"),
  imapHost: z.string().trim().default(""),
  imapPort: port.default(993),
  imapUsername: z.string().trim().default(""),
  imapPassword: z.string().default(""),
  dailyLimit: z.coerce.number().int().min(1).max(5000).default(DEFAULTS.senderDailyLimit),
  hourlyLimit: z.coerce.number().int().min(1).max(1000).default(DEFAULTS.senderHourlyLimit),
  timezone: z.string().trim().default("UTC"),
  signature: z.string().default(""),
});
export type SenderCsvInput = z.infer<typeof senderCsvRowSchema>;

/* ─── Templates ────────────────────────────────────────────────────────── */

export const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name").max(120),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  bodyText: z.string().max(50_000).default(""),
  bodyHtml: z.string().max(100_000).default(""),
  format: z.enum(["text", "html"]).default("text"),
});
export type TemplateInput = z.infer<typeof templateSchema>;

export const sendTestEmailSchema = z.object({
  to: z.string().trim().email("Enter a valid recipient"),
  subject: z.string().trim().min(1).max(300),
  bodyText: z.string().max(50_000).default(""),
  bodyHtml: z.string().max(100_000).default(""),
  format: z.enum(["text", "html"]).default("text"),
  senderId: z.string().min(1, "Pick a sender to send the test from"),
  /** Sample merge variables for the preview, e.g. {"first_name":"Ada"} */
  sampleVars: z.record(z.string(), z.string()).optional(),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;

/* ─── Campaigns ────────────────────────────────────────────────────────── */

export const campaignCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name").max(140),
    leadListId: z.string().min(1, "Choose a lead list"),
    senderIds: z.array(z.string().min(1)).min(1, "Pick at least one sender"),
    templateId: z.string().min(1, "Choose a template"),
    startMode: z.enum(["now", "later"]).default("now"),
    scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
    businessDaysOnly: z.boolean().default(false),
    sendingTimezone: z
      .string()
      .refine((v) => (TIMEZONES as readonly string[]).includes(v), "Unknown timezone")
      .default(DEFAULTS.sendingTimezone),
    sendingWindowStart: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
      .default(DEFAULTS.sendingWindowStart),
    sendingWindowEnd: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM")
      .default(DEFAULTS.sendingWindowEnd),
    dailyLimit: z.coerce.number().int().min(1).max(100_000).default(DEFAULTS.dailyCampaignLimit),
    minDelaySec: z.coerce.number().int().min(5).max(86_400).default(DEFAULTS.minDelaySec),
    maxDelaySec: z.coerce.number().int().min(5).max(86_400).default(DEFAULTS.maxDelaySec),
    maxEmailsPerSenderPerDay: z.coerce
      .number()
      .int()
      .min(1)
      .max(5000)
      .default(DEFAULTS.maxEmailsPerSenderPerDay),
    stopOnReply: z.boolean().default(true),
    retryFailed: z.boolean().default(true),
    retryCount: z.coerce.number().int().min(0).max(10).default(DEFAULTS.retryCount),
  })
  .refine((v) => v.maxDelaySec >= v.minDelaySec, {
    message: "Max delay must be ≥ min delay",
    path: ["maxDelaySec"],
  })
  .refine((v) => v.startMode !== "later" || !!v.scheduledAt, {
    message: "Pick a start date & time",
    path: ["scheduledAt"],
  });
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

export const campaignActionSchema = z.object({
  action: z.enum(["start", "pause", "resume", "archive", "delete", "duplicate"]),
});

/* ─── Misc ─────────────────────────────────────────────────────────────── */

export const idParamSchema = z.object({ id: z.string().min(1) });

export const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(10_000),
});

/* ─── Compliance (F15–F17) ─────────────────────────────────────────────── */

export const suppressionCreateSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, "Email or @domain required")
    .max(255)
    .transform((v) => v.toLowerCase()),
  kind: z.enum(["email", "domain"]).optional(),
  reason: z.string().trim().max(500).default(""),
});
export type SuppressionCreateInput = z.infer<typeof suppressionCreateSchema>;

export const workspaceSettingsSchema = z.object({
  companyName: z.string().trim().max(200).default(""),
  postalAddress: z
    .string()
    .trim()
    .min(8, "Enter a physical postal address for CAN-SPAM compliance")
    .max(1000),
  unsubscribeBaseUrl: z
    .string()
    .trim()
    .url("Enter a valid base URL")
    .or(z.literal(""))
    .default(""),
});
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;

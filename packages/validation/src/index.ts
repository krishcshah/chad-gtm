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
/** Rename / update lead list — same name rules as create (P02). */
export const leadListRenameSchema = leadListCreateSchema;

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

const customFieldKeySchema = z.string().trim().min(1).max(64);
const customFieldsSchema = z
  .record(customFieldKeySchema, z.string().max(2000))
  .refine((o) => Object.keys(o).length <= 50, "Too many custom fields");

/** Patch map: string upserts; null deletes the key on merge. */
const customFieldsPatchSchema = z
  .record(customFieldKeySchema, z.string().max(2000).nullable())
  .refine((o) => Object.keys(o).length <= 50, "Too many custom fields");

export const leadCreateSchema = z.object({
  listId: z.string().min(1),
  email: z.string().trim().email("Enter a valid email").max(255),
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
  customFields: customFieldsSchema.optional(),
});
export type LeadCreateInput = z.infer<typeof leadCreateSchema>;

export const leadUpdateSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255).optional(),
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
  customFields: customFieldsPatchSchema.optional(),
});
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

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

export const UNIBOX_REPLY_TAG_VALUES = [
  "out_of_office",
  "not_interested",
  "interested",
  "meeting_booked",
  "won",
  "lost",
] as const;

export const uniboxReplyTagSchema = z.enum(UNIBOX_REPLY_TAG_VALUES);
export const setUniboxReplyTagSchema = z.object({
  replyId: z.string().min(1),
  tag: uniboxReplyTagSchema.nullable(),
});
export type SetUniboxReplyTagInput = z.infer<typeof setUniboxReplyTagSchema>;

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

/** Chrome `<input type="time">` emits `HH:MM:SS`; the engine stores `HH:MM`. */
const hhmm = z
  .string()
  .transform((s) => s.trim().slice(0, 5))
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"));

export const campaignCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Give the campaign a name").max(140),
    leadListId: z.string().min(1, "Lead list is required"),
    senderIds: z.array(z.string().min(1)).min(1, "Select at least one sender"),
    templateId: z.string().min(1, "Choose a template"),
    startMode: z.enum(["now", "later"]).default("now"),
    scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
    businessDaysOnly: z.boolean().default(false),
    sendingTimezone: z
      .string()
      .refine((v) => (TIMEZONES as readonly string[]).includes(v), "Unknown timezone")
      .default(DEFAULTS.sendingTimezone),
    sendingWindowStart: hhmm.default(DEFAULTS.sendingWindowStart),
    sendingWindowEnd: hhmm.default(DEFAULTS.sendingWindowEnd),
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

/** Partial campaign payload for Save as Draft — required create fields may be omitted. */
export const campaignDraftSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z
      .string()
      .trim()
      .max(140)
      .optional()
      .transform((v) => (v === undefined ? undefined : v.length > 0 ? v : "Untitled campaign")),
    leadListId: z.string().min(1).nullable().optional(),
    templateId: z.string().min(1).nullable().optional(),
    /** Empty array is allowed on draft; omit to leave existing senders unchanged on update. */
    senderIds: z.array(z.string().min(1)).optional(),
    startMode: z.enum(["now", "later"]).optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
    businessDaysOnly: z.boolean().optional(),
    sendingTimezone: z
      .string()
      .refine((v) => (TIMEZONES as readonly string[]).includes(v), "Unknown timezone")
      .optional(),
    sendingWindowStart: hhmm.optional(),
    sendingWindowEnd: hhmm.optional(),
    dailyLimit: z.coerce.number().int().min(1).max(100_000).optional(),
    minDelaySec: z.coerce.number().int().min(5).max(86_400).optional(),
    maxDelaySec: z.coerce.number().int().min(5).max(86_400).optional(),
    maxEmailsPerSenderPerDay: z.coerce.number().int().min(1).max(5000).optional(),
    stopOnReply: z.boolean().optional(),
    retryFailed: z.boolean().optional(),
    retryCount: z.coerce.number().int().min(0).max(10).optional(),
    wizardStep: z.coerce.number().int().min(1).max(20).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.minDelaySec !== undefined &&
      v.maxDelaySec !== undefined &&
      v.maxDelaySec < v.minDelaySec
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Max delay must be ≥ min delay",
        path: ["maxDelaySec"],
      });
    }
  });
export type CampaignDraftInput = z.infer<typeof campaignDraftSchema>;

/** Full create (+ optional id to publish an existing draft). */
export const campaignPublishSchema = campaignCreateSchema.and(
  z.object({ id: z.string().min(1).optional() }),
);
export type CampaignPublishInput = z.infer<typeof campaignPublishSchema>;

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

/** Cursor-paginated blocklist listing (F15a). */
export const suppressionListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(200).optional(),
  kind: z.enum(["email", "domain"]).optional(),
});
export type SuppressionListQuery = z.infer<typeof suppressionListQuerySchema>;

const SUPPRESSION_IMPORT_MAX = 10_000;

/** Bulk import: either `lines` (max 10k) or `text` split on newlines/commas. */
export const suppressionImportSchema = z.union([
  z.object({ lines: z.array(z.string()).max(SUPPRESSION_IMPORT_MAX) }),
  z.object({ text: z.string().min(1).max(2_000_000) }),
]);
export type SuppressionImportInput = z.infer<typeof suppressionImportSchema>;

const EMAIL_TOKEN_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Bare or @-prefixed domains: at least one dot, no spaces/@ mid-label. */
const DOMAIN_TOKEN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

export type ParsedSuppressionToken =
  | { ok: true; value: string; kind: "email" | "domain" }
  | { ok: false };

/** Normalize one import token → email or @domain (matches compliance helpers). */
export function parseSuppressionToken(raw: string): ParsedSuppressionToken {
  const t = raw.trim().toLowerCase();
  if (!t || t.length > 255) return { ok: false };

  if (t.startsWith("@")) {
    const d = t.slice(1).trim();
    if (!d || !DOMAIN_TOKEN_RE.test(d)) return { ok: false };
    return { ok: true, value: `@${d}`, kind: "domain" };
  }

  if (t.includes("@")) {
    if (!EMAIL_TOKEN_RE.test(t)) return { ok: false };
    return { ok: true, value: t, kind: "email" };
  }

  // bare domain.com
  if (!DOMAIN_TOKEN_RE.test(t)) return { ok: false };
  return { ok: true, value: `@${t}`, kind: "domain" };
}

/** Expand import input to a flat token list (cap 10k when expanding text). */
export function expandSuppressionImportLines(
  input: SuppressionImportInput,
): { ok: true; lines: string[] } | { ok: false; error: string } {
  if ("lines" in input) return { ok: true, lines: input.lines };
  const lines = input.text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (lines.length > SUPPRESSION_IMPORT_MAX) {
    return { ok: false, error: `Max ${SUPPRESSION_IMPORT_MAX} entries` };
  }
  return { ok: true, lines };
}

export const workspaceSettingsSchema = z.object({
  companyName: z.string().trim().max(200).default(""),
  /** Optional storage only — not required to start/send campaigns. */
  postalAddress: z.string().trim().max(1000).default(""),
  unsubscribeBaseUrl: z
    .string()
    .trim()
    .url("Enter a valid base URL")
    .or(z.literal(""))
    .default(""),
});
export type WorkspaceSettingsInput = z.infer<typeof workspaceSettingsSchema>;

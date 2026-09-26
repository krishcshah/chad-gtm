/**
 * SmartReach domain schema.
 *
 * Portability notes:
 *  - All timestamps are ISO-8601 strings stored in `text` columns. This keeps
 *    the schema identical across better-sqlite3 (local) and Neon (prod), and
 *    avoids Date-mode serialization surprises in Cloudflare Workers.
 *  - JSON blobs (custom fields, tags) are `text` columns with a JSON codec.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./schema-auth";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
/**
 * ISO-8601 UTC timestamp default. Uses Postgres `now()` rendered to ISO text at
 * insert time; we keep the column type as `text` for portability across drivers
 * (Neon serverless, better-sqlite3) and to avoid Date-mode serialization in Workers.
 */
const isoNow = sql`to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS.MSZ')`;
const createdAt = () => text("created_at").notNull().default(isoNow);
const updatedAt = () => text("updated_at").notNull().default(isoNow);

/* ─── Workspaces (multi-client isolation) ─────────────────────────────── */

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("workspaces_user_idx").on(t.userId),
  ],
);

/* ─── Subscriptions & Billing ─────────────────────────────────────────── */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    status: text("status").notNull().default("trialing"), // trialing, active, past_due, canceled, lifetime
    plan: text("plan").notNull().default("lifetime_trial"),
    currentPeriodEnd: text("current_period_end"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    uniqueIndex("subscriptions_user_unique").on(t.userId),
  ],
);

/* ─── Lead lists & leads ───────────────────────────────────────────────── */

export const leadLists = pgTable(
  "lead_lists",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lead_lists_user_idx").on(t.userId),
    index("lead_lists_workspace_idx").on(t.workspaceId),
    uniqueIndex("lead_lists_user_name_active_unique").on(t.userId, t.name, t.deletedAt),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    listId: text("list_id")
      .notNull()
      .references(() => leadLists.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    company: text("company"),
    website: text("website"),
    linkedin: text("linkedin"),
    jobTitle: text("job_title"),
    location: text("location"),
    phone: text("phone"),
    industry: text("industry"),
    /** JSON object of unmapped CSV columns → merge variables. */
    customFields: jsonb("custom_fields")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    /** JSON array of tag ids. */
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    status: text("status", {
      enum: ["new", "contacted", "replied", "bounced", "unsubscribed", "blocked"],
    })
      .notNull()
      .default("new"),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leads_user_idx").on(t.userId),
    index("leads_workspace_idx").on(t.workspaceId),
    index("leads_list_idx").on(t.listId),
    index("leads_status_idx").on(t.status),
    index("leads_email_idx").on(t.email),
    index("leads_cursor_idx").on(t.createdAt, t.id),
    uniqueIndex("leads_list_email_active_unique").on(t.listId, t.email, t.deletedAt),
  ],
);

export const leadTags = pgTable(
  "lead_tags",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lead_tags_user_name_unique").on(t.userId, t.name)],
);

/* ─── Sender accounts ──────────────────────────────────────────────────── */

export const senderAccounts = pgTable(
  "sender_accounts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    senderName: text("sender_name").notNull(),
    email: text("email").notNull(),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull().default(587),
    smtpUsername: text("smtp_username").notNull(),
    smtpPasswordEnc: text("smtp_password_enc").notNull(),
    smtpSecurity: text("smtp_security", { enum: ["tls", "ssl", "none"] })
      .notNull()
      .default("tls"),
    imapHost: text("imap_host").notNull().default(""),
    imapPort: integer("imap_port").notNull().default(993),
    imapUsername: text("imap_username").notNull().default(""),
    imapPasswordEnc: text("imap_password_enc").notNull().default(""),
    dailyLimit: integer("daily_limit").notNull().default(50),
    hourlyLimit: integer("hourly_limit").notNull().default(10),
    fromName: text("from_name").notNull().default(""),
    replyTo: text("reply_to").notNull().default(""),
    timezone: text("timezone").notNull().default("UTC"),
    signature: text("signature").notNull().default(""),
    status: text("status", { enum: ["active", "paused", "failed"] })
      .notNull()
      .default("active"),
    health: integer("health").notNull().default(100), // 0-100
    smtpStatus: text("smtp_status", { enum: ["untested", "ok", "failed"] })
      .notNull()
      .default("untested"),
    imapStatus: text("imap_status", { enum: ["untested", "ok", "failed"] })
      .notNull()
      .default("untested"),
    lastSyncAt: text("last_sync_at"),
    repliedCount: integer("replied_count").notNull().default(0),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sender_accounts_user_idx").on(t.userId),
    index("sender_accounts_workspace_idx").on(t.workspaceId),
    index("sender_accounts_status_idx").on(t.status),
    uniqueIndex("sender_accounts_user_email_active_unique").on(t.userId, t.email, t.deletedAt),
  ],
);

/* ─── Email templates ──────────────────────────────────────────────────── */

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    format: text("format", { enum: ["text", "html"] }).notNull().default("text"),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("email_templates_user_idx").on(t.userId)],
);

/* ─── Campaigns ────────────────────────────────────────────────────────── */

export const campaigns = pgTable(
  "campaigns",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["draft", "scheduled", "running", "paused", "completed", "archived"],
    })
      .notNull()
      .default("draft"),
    leadListId: text("lead_list_id").references(() => leadLists.id, { onDelete: "restrict" }),
    templateId: text("template_id").references(() => emailTemplates.id, { onDelete: "restrict" }),
    /** Wizard resume cursor (1-based step). Null once published / not used. */
    wizardStep: integer("wizard_step"),
    scheduledAt: text("scheduled_at"),
    businessDaysOnly: boolean("business_days_only").notNull().default(false),
    sendingTimezone: text("sending_timezone").notNull().default("UTC"),
    sendingWindowStart: text("sending_window_start").notNull().default("09:00"),
    sendingWindowEnd: text("sending_window_end").notNull().default("17:00"),
    dailyLimit: integer("daily_limit").notNull().default(100),
    minDelaySec: integer("min_delay_sec").notNull().default(90),
    maxDelaySec: integer("max_delay_sec").notNull().default(240),
    maxEmailsPerSenderPerDay: integer("max_emails_per_sender_per_day").notNull().default(50),
    stopOnReply: boolean("stop_on_reply").notNull().default(true),
    retryFailed: boolean("retry_failed").notNull().default(true),
    retryCount: integer("retry_count").notNull().default(3),
    /** round-robin cursor into campaign_senders */
    lastSenderIdx: integer("last_sender_idx").notNull().default(0),
    /** temporary pause for cross-campaign per-sender daily cap */
    senderCapUntil: text("sender_cap_until"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("campaigns_user_idx").on(t.userId),
    index("campaigns_workspace_idx").on(t.workspaceId),
    index("campaigns_status_idx").on(t.status),
    index("campaigns_due_idx").on(t.status, t.scheduledAt),
  ],
);

export const campaignSenders = pgTable(
  "campaign_senders",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => senderAccounts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.senderId] }),
    index("campaign_senders_sender_idx").on(t.senderId),
  ],
);

export const campaignLeads = pgTable(
  "campaign_leads",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["queued", "scheduled", "sent", "replied", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    /** Next sequence step to send (1-based). Default 1 for single-template campaigns. */
    stepPosition: integer("step_position").notNull().default(1),
    scheduledFor: text("scheduled_for"),
    sentAt: text("sent_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("campaign_leads_campaign_lead_unique").on(t.campaignId, t.leadId),
    index("campaign_leads_sched_idx").on(t.campaignId, t.status, t.scheduledFor),
    index("campaign_leads_lead_idx").on(t.leadId),
  ],
);

/* ─── Email jobs (durable send queue) ──────────────────────────────────── */

export const emailJobs = pgTable(
  "email_jobs",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    campaignLeadId: text("campaign_lead_id")
      .notNull()
      .references(() => campaignLeads.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => senderAccounts.id, { onDelete: "cascade" }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    /** Sequence step position this job belongs to (1-based). */
    stepPosition: integer("step_position").notNull().default(1),
    sequenceStepId: text("sequence_step_id"),
    variantId: text("variant_id"),
    status: text("status", {
      enum: ["pending", "processing", "sent", "failed", "retry", "bounced", "cancelled"],
    })
      .notNull()
      .default("pending"),
    scheduledFor: text("scheduled_for").notNull(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    messageId: text("message_id"),
    sentAt: text("sent_at"),
    processingAt: text("processing_at"), // stuck-job recovery marker
    /** When true, only ENGINE_DRY_RUN workers may claim/process this job. */
    dryRun: boolean("dry_run").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("email_jobs_campaign_lead_step_unique").on(t.campaignLeadId, t.stepPosition),
    index("email_jobs_poll_idx").on(t.status, t.scheduledFor, t.dryRun),
    index("email_jobs_sender_idx").on(t.senderId, t.status),
    index("email_jobs_campaign_idx").on(t.campaignId, t.status),
    index("email_jobs_recovery_idx").on(t.status, t.processingAt, t.dryRun),
  ],
);


/* ─── Campaign sequences (F19) ─────────────────────────────────────────── */

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    /** 1-based order in the campaign sequence. */
    position: integer("position").notNull(),
    /** Calendar days to wait after the previous step before sending this one (step 1 usually 0). */
    delayDays: integer("delay_days").notNull().default(0),
    type: text("type", { enum: ["initial", "follow_up"] })
      .notNull()
      .default("initial"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sequence_steps_campaign_position_unique").on(t.campaignId, t.position),
    index("sequence_steps_campaign_idx").on(t.campaignId),
  ],
);

export const sequenceStepVariants = pgTable(
  "sequence_step_variants",
  {
    id: id(),
    stepId: text("step_id")
      .notNull()
      .references(() => sequenceSteps.id, { onDelete: "cascade" }),
    /** A / B / … label for the step rail. */
    label: text("label").notNull().default("A"),
    subject: text("subject").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    /** Equal-weight A/B default 50; unused when only one active variant. */
    weight: integer("weight").notNull().default(50),
    pausedAt: text("paused_at"),
    aiGenerateOnTheFly: boolean("ai_generate_on_the_fly").notNull().default(false),
    aiPrompt: text("ai_prompt").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sequence_step_variants_step_idx").on(t.stepId),
    uniqueIndex("sequence_step_variants_step_label_unique").on(t.stepId, t.label),
  ],
);

/* ─── Daily usage counters (per-sender / per-campaign rate limiting) ───── */

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: ["sender", "campaign"] }).notNull(),
    entityId: text("entity_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (UTC)
    count: integer("count").notNull().default(0),
  },
  (t) => [
    uniqueIndex("usage_counters_unique").on(t.entityType, t.entityId, t.date),
    index("usage_counters_user_idx").on(t.userId),
  ],
);

/* ─── Replies ──────────────────────────────────────────────────────────── */

export const replies = pgTable(
  "replies",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => senderAccounts.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull(),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    messageId: text("message_id"),
    receivedAt: text("received_at").notNull(),
    readAt: text("read_at"),
    /** Operator disposition tag — nullable; Unibox tags do not change lead status. */
    tag: text("tag", {
      enum: [
        "out_of_office",
        "not_interested",
        "interested",
        "meeting_booked",
        "won",
        "lost",
      ],
    }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("replies_message_unique").on(t.senderId, t.messageId),
    index("replies_user_idx").on(t.userId, t.receivedAt),
    index("replies_lead_idx").on(t.leadId),
    index("replies_tag_idx").on(t.tag),
  ],
);

/* ─── Activity log ─────────────────────────────────────────────────────── */

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    campaignId: text("campaign_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_logs_user_idx").on(t.userId, t.createdAt)],
);


/* ─── Suppressions / block list (F15) ──────────────────────────────────── */

export const suppressions = pgTable(
  "suppressions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Lowercased email OR leading-@ domain like "@example.com". */
    value: text("value").notNull(),
    kind: text("kind", { enum: ["email", "domain"] }).notNull().default("email"),
    reason: text("reason").notNull().default(""),
    source: text("source", {
      enum: ["manual", "unsubscribe", "bounce", "complaint", "import"],
    })
      .notNull()
      .default("manual"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("suppressions_user_value_unique").on(t.userId, t.value),
    index("suppressions_user_idx").on(t.userId),
    index("suppressions_workspace_idx").on(t.workspaceId),
    index("suppressions_value_idx").on(t.value),
  ],
);

/* ─── Workspace settings (F16/F17 compliance) ──────────────────────────── */

export const workspaceSettings = pgTable("workspace_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull().default(""),
  /** Physical postal address required by CAN-SPAM on commercial mail. */
  postalAddress: text("postal_address").notNull().default(""),
  unsubscribeBaseUrl: text("unsubscribe_base_url").notNull().default(""),
  aiApiKeyEnc: text("ai_api_key_enc"),
  aiProvider: text("ai_provider").notNull().default("google"),
  aiModel: text("ai_model").notNull().default("gemini-3.8-flash"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ─── Unibox operator messages (F11c thread store) ─────────────────────── */

export const uniboxMessages = pgTable(
  "unibox_messages",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Anchor inbound reply that opened the thread (nullable for lead+campaign lookups). */
    replyId: text("reply_id").references(() => replies.id, { onDelete: "set null" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    senderId: text("sender_id").references(() => senderAccounts.id, { onDelete: "set null" }),
    direction: text("direction", { enum: ["campaign", "inbound", "operator"] })
      .notNull()
      .default("operator"),
    fromRole: text("from_role", { enum: ["automation", "lead", "operator"] })
      .notNull()
      .default("operator"),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    subject: text("subject"),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    sentAt: text("sent_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("unibox_messages_user_sent_idx").on(t.userId, t.sentAt),
    index("unibox_messages_workspace_idx").on(t.workspaceId),
    index("unibox_messages_reply_idx").on(t.replyId),
    index("unibox_messages_lead_campaign_idx").on(t.leadId, t.campaignId),
  ],
);

/* ─── Email tracking events (open pixel & link click tracking) ────────── */

export const emailTrackingEvents = pgTable(
  "email_tracking_events",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => emailJobs.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    type: text("type", { enum: ["open", "click"] }).notNull(),
    targetUrl: text("target_url"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("email_tracking_user_type_idx").on(t.userId, t.type, t.createdAt),
    index("email_tracking_campaign_type_idx").on(t.campaignId, t.type, t.createdAt),
    index("email_tracking_job_idx").on(t.jobId, t.type),
  ],
);

/* ─── Re-export auth tables so drizzle sees the whole graph ────────────── */
export * from "./schema-auth";

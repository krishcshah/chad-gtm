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
  smallint,
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
    /** Sender identity for this workspace's mail (CAN-SPAM footer). */
    companyName: text("company_name").notNull().default(""),
    postalAddress: text("postal_address").notNull().default(""),
    /** Default booking link; runs and campaigns may override it. */
    bookingUrl: text("booking_url"),
    /** Who gets "Needs you" notices. Empty = the account's login email. */
    notifyEmail: text("notify_email").notNull().default(""),
    notifyEscalations: boolean("notify_escalations").notNull().default(true),
    notifyReminders: boolean("notify_reminders").notNull().default(true),
    /**
     * "Lead conversations" workspace default, used by campaigns set to
     * 'default': agent = Agent, approve = Agent drafts, you approve,
     * manual = Manual.
     */
    leadConversationMode: text("lead_conversation_mode", { enum: ["agent", "approve", "manual"] })
      .notNull()
      .default("manual"),
    /** "Pause the agent everywhere": no agent replies in this workspace. */
    agentPaused: boolean("agent_paused").notNull().default(false),
    /** Business profile the agent grounds its replies in. */
    companySummary: text("company_summary").notNull().default(""),
    mainOffer: text("main_offer").notNull().default(""),
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

/* ─── B2B Database Access & Paywall ──────────────────────────────────── */

export const b2bDatabaseAccess = pgTable(
  "b2b_database_access",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeSessionId: text("stripe_session_id"),
    amountCents: integer("amount_cents").notNull().default(9900),
    status: text("status").notNull().default("active"), // active, revoked
    source: text("source").notNull().default("stripe_checkout"), // stripe_checkout, admin_grant, lifetime_demo
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("b2b_database_access_user_idx").on(t.userId),
    index("b2b_database_access_status_idx").on(t.status),
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
      enum: [
        "new",
        "contacted",
        "replied",
        "interested",
        "meeting_booked",
        "won",
        "lost",
        "bounced",
        "unsubscribed",
        "blocked",
      ],
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
    /** Consecutive failed IMAP syncs, and when one was last attempted. */
    imapFailCount: integer("imap_fail_count").notNull().default(0),
    imapAttemptedAt: text("imap_attempted_at"),
    /** Consecutive send failures, the last failure reason, and last re-test. */
    failureCount: integer("failure_count").notNull().default(0),
    failedReason: text("failed_reason"),
    lastRetestAt: text("last_retest_at"),
    repliedCount: integer("replied_count").notNull().default(0),
    isSystemPool: boolean("is_system_pool").notNull().default(false),
    deletedAt: text("deleted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sender_accounts_user_idx").on(t.userId),
    index("sender_accounts_workspace_idx").on(t.workspaceId),
    index("sender_accounts_status_idx").on(t.status),
    index("sender_accounts_pool_idx").on(t.isSystemPool),
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
    /** 'autopilot' = created by an Autopilot run, not by the user. */
    source: text("source", { enum: ["user", "autopilot"] }).notNull().default("user"),
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
    maxEmailsPerSenderPerDay: integer("max_emails_per_sender_per_day").notNull().default(30),
    stopOnReply: boolean("stop_on_reply").notNull().default(true),
    retryFailed: boolean("retry_failed").notNull().default(true),
    retryCount: integer("retry_count").notNull().default(3),
    trackOpens: boolean("track_opens").notNull().default(true),
    /** round-robin cursor into campaign_senders */
    lastSenderIdx: integer("last_sender_idx").notNull().default(0),
    /** temporary pause for cross-campaign per-sender daily cap */
    senderCapUntil: text("sender_cap_until"),
    /** Why the engine is holding this campaign (shown to the user), and since when. */
    sendBlockReason: text("send_block_reason"),
    sendBlockSince: text("send_block_since"),
    /**
     * "Lead conversations" for this campaign. 'default' = use the workspace
     * default (workspaces.lead_conversation_mode). Shared by the campaign page
     * and its Autopilot run.
     */
    leadConversationMode: text("lead_conversation_mode", {
      enum: ["default", "agent", "approve", "manual"],
    })
      .notNull()
      .default("default"),
    /** Optional "What this campaign offers" grounding for the agent. */
    agentOffer: text("agent_offer").notNull().default(""),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    /** True while an Autopilot campaign still has contacts to load (never auto-completes). */
    audienceOpen: boolean("audience_open").notNull().default(false),
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
    /** Autopilot sending tier: 1 target titles, 2 other decision-makers, 3 everyone else (null sorts last). */
    priority: smallint("priority"),
    scheduledFor: text("scheduled_for"),
    sentAt: text("sent_at"),
    lastError: text("last_error"),
    /*
     * AI-written email for the current step, written ahead of sending by the
     * drafter (packages/email-engine/src/drafter.ts). Valid only while
     * draftStep = stepPosition; cleared when the lead moves to the next step.
     * Bodies hold {{sender_name}} and other {{vars}}, filled in at schedule time.
     */
    draftStep: integer("draft_step"),
    draftVariantId: text("draft_variant_id"),
    draftSubject: text("draft_subject"),
    draftBodyText: text("draft_body_text"),
    draftBodyHtml: text("draft_body_html"),
    /** drafting (being written) | ready | failed (waiting to retry). */
    draftStatus: text("draft_status", { enum: ["drafting", "ready", "failed"] }),
    draftAttempts: integer("draft_attempts").notNull().default(0),
    /** Next try after a failure; while drafting, when the claim expires. */
    draftRetryAt: text("draft_retry_at"),
    draftError: text("draft_error"),
    draftedAt: text("drafted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("campaign_leads_campaign_lead_unique").on(t.campaignId, t.leadId),
    index("campaign_leads_sched_idx").on(t.campaignId, t.status, t.scheduledFor),
    index("campaign_leads_lead_idx").on(t.leadId),
    index("campaign_leads_queue_order_idx").on(t.campaignId, t.status, t.stepPosition, t.priority),
    index("campaign_leads_draft_idx").on(t.campaignId, t.status, t.draftStatus).where(sql`${t.draftStatus} is not null`),
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
    entityType: text("entity_type", { enum: ["sender", "campaign", "sender_reply"] }).notNull(),
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
    /** Who set `tag`. NULL with a tag = automatic (legacy rows). */
    tagSource: text("tag_source", { enum: ["human", "auto"] }),
    /**
     * Reply-agent lifecycle. NULL = not an agent-managed campaign.
     * pending → (replied | escalated | held | human_replied | skipped | failed).
     * held = account not approved; human_replied = a person answered first.
     */
    agentStatus: text("agent_status", {
      enum: [
        "pending",
        "processing",
        "replied",
        "escalated",
        "held",
        "human_replied",
        "skipped",
        "failed",
      ],
    }),
    /** Classified intent (interested, question, resource_request, ...). */
    agentIntent: text("agent_intent"),
    /** One-line explanation of what the agent decided and why. */
    agentSummary: text("agent_summary"),
    agentHandledAt: text("agent_handled_at"),
    /** How many times the agent has tried this reply (retry budget). */
    agentAttempts: integer("agent_attempts").notNull().default(0),
    /** ISO time the agent claimed it (to recover replies stuck in processing). */
    agentClaimedAt: text("agent_claimed_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("replies_agent_status_idx").on(t.agentStatus),
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
    /** NULL = platform-level opt-out (owner deleted, or an erasure request). */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "set null" }),
    /** Lowercased email OR leading-@ domain like "@example.com". */
    value: text("value").notNull(),
    kind: text("kind", { enum: ["email", "domain"] }).notNull().default("email"),
    reason: text("reason").notNull().default(""),
    source: text("source", {
      enum: [
        "manual",
        "unsubscribe",
        "bounce",
        "complaint",
        "import",
        "not_interested",
        "erasure",
      ],
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

/**
 * Permanent ledger of when an address was contacted. No foreign keys, so it
 * survives workspace and account deletion (90-day re-contact check).
 */
export const contactHistory = pgTable(
  "contact_history",
  {
    id: id(),
    /** Lowercased email address. */
    email: text("email").notNull(),
    contactedAt: text("contacted_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contact_history_email_idx").on(t.email, t.contactedAt)],
);

/* ─── Workspace settings (F16/F17 compliance) ──────────────────────────── */

export const workspaceSettings = pgTable("workspace_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "set null" }),
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
    fromRole: text("from_role", { enum: ["automation", "lead", "operator", "agent"] })
      .notNull()
      .default("operator"),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    subject: text("subject"),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    /** Agent-written message a person approved ("Agent, approved by you"). */
    approvedByUser: boolean("approved_by_user").notNull().default(false),
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

/* ─── Support Tickets & Threads ────────────────────────────────────────── */

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userEmail: text("user_email").notNull(),
    userName: text("user_name"),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    category: text("category", {
      enum: ["bug_report", "feature_request", "suggestion", "contact", "miscellaneous", "legal"],
    })
      .notNull()
      .default("bug_report"),
    heading: text("heading").notNull(),
    description: text("description").notNull(),
    url: text("url"),
    status: text("status", { enum: ["open", "in_progress", "resolved", "closed"] })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("support_tickets_user_idx").on(t.userId),
    index("support_tickets_created_idx").on(t.createdAt),
    index("support_tickets_status_idx").on(t.status),
    index("support_tickets_category_idx").on(t.category),
  ],
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: id(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userName: text("user_name"),
    userEmail: text("user_email").notNull(),
    senderRole: text("sender_role", { enum: ["user", "admin"] })
      .notNull()
      .default("user"),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("support_messages_ticket_idx").on(t.ticketId),
    index("support_messages_created_idx").on(t.createdAt),
  ],
);

/* Backward compatibility alias */
export const bugReports = supportTickets;

/* ─── Data Removal Requests (GDPR Right to Erasure / Remove My Info) ──── */

export const dataRemovalRequests = pgTable(
  "data_removal_requests",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    contactEmail: text("contact_email").notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: ["pending", "in_progress", "completed", "rejected"] })
      .notNull()
      .default("pending"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("data_removal_user_idx").on(t.userId),
    index("data_removal_email_idx").on(t.contactEmail),
    index("data_removal_status_idx").on(t.status),
    index("data_removal_created_idx").on(t.createdAt),
  ],
);

/* ─── Page view analytics (Admin tracking) ────────────────────────── */

export const pageViews = pgTable(
  "page_views",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    path: text("path").notNull(),
    pageTitle: text("page_title"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: createdAt(),
  },
  (t) => [
    index("page_views_user_idx").on(t.userId),
    index("page_views_path_idx").on(t.path),
    index("page_views_created_at_idx").on(t.createdAt),
    index("page_views_user_created_idx").on(t.userId, t.createdAt),
  ],
);

/* ─── ChadGTM Autonomous Go-To-Market Runs ────────────────────────────── */

export const chadGtmRuns = pgTable(
  "chad_gtm_runs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    companyName: text("company_name").notNull().default(""),
    status: text("status", {
      enum: [
        "analyzing",
        "needs_input",
        "reviewing",
        "calibrating",
        "ready",
        "active",
        "paused",
        "completed",
      ],
    })
      .notNull()
      .default("analyzing"),
    businessOverview: jsonb("business_overview")
      .$type<{
        summary?: string;
        valuePropositions?: string[];
        keyDifferentiators?: string[];
        targetMarket?: string;
        [key: string]: any;
      }>()
      .notNull()
      .default({}),
    icpProfile: jsonb("icp_profile")
      .$type<{
        targetTitles?: string[];
        companySizes?: string[];
        industries?: string[];
        painPoints?: string[];
        [key: string]: any;
      }>()
      .notNull()
      .default({}),
    offers: jsonb("offers")
      .$type<Array<{
        title: string;
        angle: string;
        valueProp: string;
        cta: string;
      }>>()
      .notNull()
      .default([]),
    selectedIndustries: jsonb("selected_industries")
      .$type<string[]>()
      .notNull()
      .default([]),
    dailyEmailLimit: integer("daily_email_limit").notNull().default(30),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    /** Optional link to the agent execution trace that produced this run. */
    agentRunId: text("agent_run_id"),
    /** Where interested leads are sent to book (Calendly, Cal.com, HubSpot...). */
    bookingUrl: text("booking_url"),
    /** True when the run was launched end-to-end from a URL with no manual gates. */
    autopilot: boolean("autopilot").notNull().default(false),
    /**
     * How the reply agent handles inbound replies:
     *  autopilot — answer, share resources, and send the booking link itself
     *  approve   — draft every reply and wait for the client to approve it
     *  off       — classify only; humans reply from the UniBox
     */
    replyAgentMode: text("reply_agent_mode", { enum: ["autopilot", "approve", "off"] })
      .notNull()
      .default("autopilot"),
    /** Launch lock: set while a launch is in progress, so a second Launch stops. */
    launchStartedAt: text("launch_started_at"),
    /** Set when the user removes an unlaunched run from the Autopilot list. */
    dismissedAt: text("dismissed_at"),
    /** Autopilot audience: tier totals and cursors (apps/web/lib/autopilot-audience.ts). */
    audience: jsonb("audience").$type<Record<string, any>>().notNull().default({}),
    approvedEmailSamples: jsonb("approved_email_samples")
      .$type<Array<{
        leadId?: string;
        recipientName?: string;
        recipientCompany?: string;
        recipientTitle?: string;
        recipientIndustry?: string;
        subject: string;
        bodyText: string;
        bodyHtml?: string;
        approved: boolean;
        rejectedReason?: string;
      }>>()
      .notNull()
      .default([]),
    calibrationProfile: jsonb("calibration_profile")
      .$type<{
        voiceTone?: string;
        analysisSummary?: string;
        keyAdjustments?: string[];
        dos?: string[];
        donts?: string[];
        customAiInstruction?: string;
        calibratedSubjectTemplate?: string;
        calibratedBodyTemplate?: string;
        approvedCount?: number;
        rejectedCount?: number;
        [key: string]: any;
      }>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("chad_gtm_runs_user_idx").on(t.userId),
    index("chad_gtm_runs_workspace_idx").on(t.workspaceId),
    index("chad_gtm_runs_status_idx").on(t.status),
    index("chad_gtm_runs_campaign_idx").on(t.campaignId),
  ],
);

/* ─── Agent runtime: durable runs, steps, and LLM generations ─────────── */

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull().default("gtm_analysis"),
    goal: text("goal").notNull().default(""),
    status: text("status", {
      enum: ["running", "waiting_approval", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("running"),
    phase: text("phase").notNull().default("intake"),
    input: jsonb("input").$type<Record<string, any>>().notNull().default({}),
    state: jsonb("state").$type<Record<string, any>>().notNull().default({}),
    error: text("error"),
    budgetCents: integer("budget_cents"),
    startedAt: text("started_at").notNull().default(isoNow),
    finishedAt: text("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("agent_runs_user_idx").on(t.userId, t.createdAt),
    index("agent_runs_workspace_idx").on(t.workspaceId, t.createdAt),
    index("agent_runs_status_idx").on(t.status, t.updatedAt),
  ],
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: id(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    agent: text("agent").notNull().default("orchestrator"),
    tool: text("tool"),
    status: text("status", {
      enum: ["running", "succeeded", "failed", "skipped"],
    })
      .notNull()
      .default("running"),
    input: jsonb("input").$type<Record<string, any>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, any>>().notNull().default({}),
    error: text("error"),
    latencyMs: integer("latency_ms"),
    tokens: integer("tokens"),
    costMicros: integer("cost_micros"),
    startedAt: text("started_at").notNull().default(isoNow),
    finishedAt: text("finished_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("agent_steps_run_seq_unique").on(t.runId, t.seq),
    index("agent_steps_run_idx").on(t.runId, t.seq),
  ],
);

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: id(),
    runId: text("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    stepId: text("step_id").references(() => agentSteps.id, { onDelete: "set null" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull().default("email"),
    provider: text("provider").notNull().default("google"),
    model: text("model").notNull().default(""),
    promptHash: text("prompt_hash"),
    prompt: text("prompt"),
    response: text("response"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costMicros: integer("cost_micros"),
    latencyMs: integer("latency_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_generations_run_idx").on(t.runId, t.createdAt),
    index("ai_generations_user_idx").on(t.userId, t.createdAt),
  ],
);

/* ─── Reply agent: knowledge base + human-in-the-loop requests ────────── */

/**
 * Things the reply agent may share or say on the client's behalf: case-study
 * decks, reference customers, pricing notes, FAQ answers. Grows every time the
 * client answers an escalation so the agent never asks the same thing twice.
 */
export const agentKnowledge = pgTable(
  "agent_knowledge",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: ["resource", "faq", "fact"] })
      .notNull()
      .default("resource"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    url: text("url"),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("agent_knowledge_user_idx").on(t.userId, t.createdAt),
    index("agent_knowledge_workspace_idx").on(t.workspaceId),
  ],
);

/**
 * Escalations from the reply agent to the client ("a lead asked for your case
 * study deck — can you send it?"), plus draft approvals in approve mode.
 */
export const agentRequests = pgTable(
  "agent_requests",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    runId: text("run_id").references(() => chadGtmRuns.id, { onDelete: "set null" }),
    campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
    replyId: text("reply_id").references(() => replies.id, { onDelete: "cascade" }),
    leadId: text("lead_id").references(() => leads.id, { onDelete: "set null" }),
    kind: text("kind", {
      enum: ["resource", "question", "approval", "referral", "booking_url", "handoff", "other"],
    })
      .notNull()
      .default("question"),
    status: text("status", { enum: ["open", "sending", "resolved", "dismissed"] })
      .notNull()
      .default("open"),
    title: text("title").notNull(),
    /** What the lead actually asked, in the agent's words. */
    question: text("question").notNull().default(""),
    leadEmail: text("lead_email").notNull().default(""),
    leadName: text("lead_name").notNull().default(""),
    leadCompany: text("lead_company").notNull().default(""),
    /** Agent's proposed reply (approve mode) or holding draft. */
    draftReply: text("draft_reply").notNull().default(""),
    /** Who wrote draftReply: the agent, or the user editing it. */
    draftSource: text("draft_source", { enum: ["agent", "you"] }).notNull().default("agent"),
    /** Knowledge to save once the reply is sent (held until then). */
    pendingKnowledge: jsonb("pending_knowledge").$type<{
      answer: string;
      resourceUrl: string | null;
      save: boolean;
    }>(),
    /** Address the lead referred us to (kind = referral). */
    referralEmail: text("referral_email"),
    /** What the client provided to resolve the request. */
    resolution: text("resolution"),
    resourceUrl: text("resource_url"),
    notifiedAt: text("notified_at"),
    resolvedAt: text("resolved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("agent_requests_user_status_idx").on(t.userId, t.status, t.createdAt),
    index("agent_requests_workspace_idx").on(t.workspaceId),
    index("agent_requests_reply_idx").on(t.replyId),
    index("agent_requests_conversation_idx").on(t.leadId, t.campaignId, t.status),
  ],
);

/**
 * Who handles one lead's conversation in one campaign. No row = follow the
 * campaign's "Lead conversations" mode. handler 'you' = the agent stays silent
 * ("Handled by: You"); 'campaign' = follow the campaign again.
 */
export const leadConversations = pgTable(
  "lead_conversations",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    leadId: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    handler: text("handler", { enum: ["campaign", "you"] })
      .notNull()
      .default("campaign"),
    /** What last changed the handler. */
    handlerReason: text("handler_reason", {
      enum: ["send", "take_over", "dismiss", "hand_back"],
    }),
    handlerChangedAt: text("handler_changed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("lead_conversations_lead_campaign_unique").on(t.leadId, t.campaignId),
    index("lead_conversations_user_idx").on(t.userId),
  ],
);

/**
 * Inbound mail on a pool mailbox that matched no lead ('no_match') or leads
 * of several accounts ('ambiguous_owner'). An admin assigns or dismisses it.
 */
export const unmatchedInbound = pgTable(
  "unmatched_inbound",
  {
    id: id(),
    senderId: text("sender_id")
      .notNull()
      .references(() => senderAccounts.id, { onDelete: "cascade" }),
    messageId: text("message_id"),
    fromEmail: text("from_email").notNull(),
    fromName: text("from_name").notNull().default(""),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    bodyHtml: text("body_html").notNull().default(""),
    receivedAt: text("received_at").notNull(),
    candidateUserIds: jsonb("candidate_user_ids").$type<string[]>().notNull().default([]),
    reason: text("reason", { enum: ["no_match", "ambiguous_owner"] })
      .notNull()
      .default("no_match"),
    status: text("status", { enum: ["open", "assigned", "dismissed"] })
      .notNull()
      .default("open"),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    replyId: text("reply_id").references(() => replies.id, { onDelete: "set null" }),
    resolvedAt: text("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("unmatched_inbound_sender_message_unique").on(t.senderId, t.messageId),
    index("unmatched_inbound_status_received_idx").on(t.status, t.receivedAt),
  ],
);

/**
 * Engine liveness. Each worker process upserts its row every tick so the web
 * app (/api/health, admin) can tell when sending has stopped.
 */
export const engineHeartbeats = pgTable("engine_heartbeats", {
  /** "worker:<hostname>:<pid-agnostic name>" */
  id: text("id").primaryKey(),
  lastTickAt: text("last_tick_at").notNull(),
  lastOkAt: text("last_ok_at"),
  lastError: text("last_error"),
  stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: updatedAt(),
});

/* ─── Re-export auth tables so drizzle sees the whole graph ────────────── */
export * from "./schema-auth";


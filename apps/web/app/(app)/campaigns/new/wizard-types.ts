export interface LeadListOpt {
  id: string;
  name: string;
  leadCount: number;
  /** Leads a new campaign would email with the default rules (null: unknown). */
  sendableCount?: number | null;
  /** Leads left out because your other campaigns already emailed them. */
  contactedCount?: number | null;
}

export interface SenderOpt {
  id: string;
  senderName: string;
  email: string;
  status: string;
  dailyLimit: number;
  usedToday: number;
  /** What this mailbox can send today: its limit, the 30/day ceiling and the new-mailbox ramp. */
  dailyCap: number;
}

export interface TemplateOpt {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
}

/** Saved draft state the wizard resumes from (`?draft=`). */
export interface CampaignDraftSeed {
  id: string;
  name: string;
  leadListId: string | null;
  templateId: string | null;
  senderIds: string[];
  wizardStep: number | null;
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
  trackOpens?: boolean;
  startMode: "now" | "later";
}

/** Everything on the schedule step. Numbers may be NaN while an input is empty. */
export interface ScheduleSettings {
  startMode: "now" | "later";
  /** datetime-local value, e.g. 2026-11-06T09:00 */
  scheduledAt: string;
  businessDaysOnly: boolean;
  sendingTimezone: string;
  windowStart: string;
  windowEnd: string;
  dailyLimit: number;
  minDelay: number;
  maxDelay: number;
  perSender: number;
  stopOnReply: boolean;
  retryFailed: boolean;
  retryCount: number;
  trackOpens: boolean;
}

export type FieldErrors = Record<string, string[]>;

export const WIZARD_STEPS = [
  {
    id: 1,
    label: "Name",
    title: "Name your campaign",
    description: "Only you see this name. Pick one you will recognise in your campaign list.",
  },
  {
    id: 2,
    label: "Leads",
    title: "Choose who to email",
    description: "Pick one lead list. Its pending leads are queued for this campaign.",
  },
  {
    id: 3,
    label: "Senders",
    title: "Choose sending mailboxes",
    description: "Emails rotate across the mailboxes you pick. Each one stays within its own daily limit.",
  },
  {
    id: 4,
    label: "Sequence",
    title: "Write your emails",
    description: "The first email starts the conversation. Each follow-up waits the number of days you set.",
  },
  {
    id: 5,
    label: "Schedule",
    title: "Set the schedule and limits",
    description: "Choose when sending starts and how fast it goes. Slower sending protects your domain.",
  },
  {
    id: 6,
    label: "Review",
    title: "Ready to publish",
    description: "",
  },
] as const;

export const LAST_STEP = WIZARD_STEPS.length;

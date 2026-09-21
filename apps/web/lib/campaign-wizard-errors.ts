import { CAMPAIGN_POSTAL_REQUIRED_ERROR } from "./campaign-start-guard";

/** Zod / action keys → wizard step (1 name … 6 sending settings). */
export const CAMPAIGN_FIELD_STEP: Record<string, number> = {
  name: 1,
  leadListId: 2,
  senderIds: 3,
  templateId: 4,
  startMode: 5,
  scheduledAt: 5,
  businessDaysOnly: 5,
  sendingTimezone: 5,
  sendingWindowStart: 5,
  sendingWindowEnd: 5,
  dailyLimit: 6,
  minDelaySec: 6,
  maxDelaySec: 6,
  maxEmailsPerSenderPerDay: 6,
  stopOnReply: 6,
  retryFailed: 6,
  retryCount: 6,
  postalAddress: 6,
};

const FIELD_ORDER = [
  "name",
  "leadListId",
  "senderIds",
  "templateId",
  "startMode",
  "scheduledAt",
  "sendingTimezone",
  "sendingWindowStart",
  "sendingWindowEnd",
  "businessDaysOnly",
  "dailyLimit",
  "maxEmailsPerSenderPerDay",
  "minDelaySec",
  "maxDelaySec",
  "retryCount",
  "stopOnReply",
  "retryFailed",
  "postalAddress",
] as const;

export const CAMPAIGN_FIELD_CONTROL_ID: Record<string, string> = {
  name: "c-name",
  leadListId: "lead-list-group",
  senderIds: "sender-group",
  templateId: "template-group",
  scheduledAt: "c-when",
  sendingTimezone: "c-tz",
  sendingWindowStart: "c-window-start",
  sendingWindowEnd: "c-window-end",
  businessDaysOnly: "c-business-days",
  dailyLimit: "c-daily",
  maxEmailsPerSenderPerDay: "c-per-sender",
  minDelaySec: "c-min-delay",
  maxDelaySec: "c-max-delay",
  retryCount: "c-retry",
  stopOnReply: "c-stop-reply",
  retryFailed: "c-retry-failed",
  postalAddress: "postal-required-alert",
};

export function firstFailingCampaignField(
  fieldErrors: Record<string, string[] | undefined>,
): string | null {
  for (const key of FIELD_ORDER) {
    if (fieldErrors[key]?.length) return key;
  }
  return Object.keys(fieldErrors).find((key) => fieldErrors[key]?.length) ?? null;
}

export function firstFailingCampaignStep(
  fieldErrors: Record<string, string[] | undefined>,
): number | null {
  const key = firstFailingCampaignField(fieldErrors);
  if (!key) return null;
  return CAMPAIGN_FIELD_STEP[key] ?? null;
}

/** Forge start gate: named string, with or without a postalAddress field error. */
export function isPostalComplianceError(
  error: string,
  fieldErrors?: Record<string, string[] | undefined>,
): boolean {
  if (fieldErrors?.postalAddress?.length) return true;
  return (
    error === CAMPAIGN_POSTAL_REQUIRED_ERROR ||
    /postal address/i.test(error) ||
    error.includes("Settings → Compliance") ||
    error.includes("postal-address-required")
  );
}

/**
 * Pure helpers for the campaign Settings sheet (updateCampaignSettings).
 * Not a server-action module: safe to import from tests.
 */
import { HARD_MAX_PER_SENDER_PER_DAY } from "@smartreach/shared";

const MAX_RETRY_COUNT = 10;

function wholeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * The per-mailbox limit and retry settings to save. Only valid keys come
 * back, each normalised: the per-mailbox limit is clamped to 1..30 (the
 * engine's hard cap), the retry count to 0..10.
 */
export function sendingSettingsPatch(input: {
  maxEmailsPerSenderPerDay?: unknown;
  retryFailed?: unknown;
  retryCount?: unknown;
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const perSender = wholeNumber(input.maxEmailsPerSenderPerDay);
  if (perSender !== null) {
    patch.maxEmailsPerSenderPerDay = Math.min(HARD_MAX_PER_SENDER_PER_DAY, Math.max(1, perSender));
  }
  if (typeof input.retryFailed === "boolean") patch.retryFailed = input.retryFailed;
  const retryCount = wholeNumber(input.retryCount);
  if (retryCount !== null) patch.retryCount = Math.min(MAX_RETRY_COUNT, Math.max(0, retryCount));
  return patch;
}

/** email_jobs.max_attempts for a campaign's retry settings (same rule the scheduler uses). */
export function jobMaxAttempts(retryFailed: boolean, retryCount: number): number {
  return retryFailed ? retryCount : 1;
}

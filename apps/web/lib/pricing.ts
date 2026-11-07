/**
 * Pricing maths, safe for both server and browser code.
 *
 * Every email sent costs the same, follow-ups included. One lead gets three
 * emails (outreach, then follow-ups two and four days later), so leads
 * contacted is roughly a third of emails sent.
 */

/** OWNER: price per email sent, in US cents. Keep in sync with the landing page. */
export const PRICE_CENTS_PER_EMAIL = 5;
/** Outreach plus two follow-ups. */
export const EMAILS_PER_LEAD = 3;
/** Sending runs Monday to Friday. */
export const SENDING_DAYS_PER_MONTH = 22;

export function costCents(emails: number): number {
  return Math.max(0, Math.round(emails)) * PRICE_CENTS_PER_EMAIL;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Dollars without cents when whole ("$110"), with cents otherwise ("$3.15"). */
export function formatCost(cents: number): string {
  return cents % 100 === 0
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : formatCents(cents);
}

/** What a daily volume adds up to over a month of sending days. */
export function forecastFromDailyVolume(perDay: number) {
  const emails = Math.max(0, Math.round(perDay)) * SENDING_DAYS_PER_MONTH;
  return {
    emailsPerMonth: emails,
    newLeadsPerDay: Math.floor(perDay / EMAILS_PER_LEAD),
    leadsPerMonth: Math.round(emails / EMAILS_PER_LEAD),
    costCentsPerMonth: costCents(emails),
  };
}

export function monthBounds(now = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

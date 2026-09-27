export const STRIPE_PAYMENT_LINK =
  process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK ||
  "https://buy.stripe.com/28E3cx50Q5Kh23ieHQ6wE0m";

/**
 * Builds the direct Stripe Checkout / Donation URL with prefilled user email and client reference.
 */
export function getCheckoutUrl(email?: string, userId?: string, amount?: number, frequency?: string): string {
  try {
    const url = new URL(STRIPE_PAYMENT_LINK);
    if (email) url.searchParams.set("prefilled_email", email);
    if (userId) url.searchParams.set("client_reference_id", userId);
    return url.toString();
  } catch {
    return STRIPE_PAYMENT_LINK;
  }
}

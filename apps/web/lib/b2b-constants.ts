/**
 * Client-safe B2B Database constants and Stripe Checkout URL helper
 * Free of server-only / database modules.
 */

export const STRIPE_B2B_CHECKOUT_BASE = "https://donate.stripe.com/aFafZjgJy2y5azOgPY6wE0q";

export function getB2BCheckoutUrl(email?: string, userId?: string): string {
  try {
    const url = new URL(STRIPE_B2B_CHECKOUT_BASE);
    url.searchParams.set("prefilled_amount", "9900"); // $99.00 USD
    if (email) url.searchParams.set("prefilled_email", email);
    if (userId) url.searchParams.set("client_reference_id", userId);
    return url.toString();
  } catch {
    return `${STRIPE_B2B_CHECKOUT_BASE}?prefilled_amount=9900`;
  }
}

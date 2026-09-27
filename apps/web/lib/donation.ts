/**
 * Live Stripe Product & Payment Links for SmartReach Community Support
 * Stripe Account: acct_1QXsSpRxeTlyT7jA (leadskingdom.co)
 * Product ID: prod_VKm2ZHflOlLBUc ("SmartReach Community Support")
 */

export const STRIPE_DONATION_PRODUCT_ID = "prod_VKm2ZHflOlLBUc";

export const STRIPE_DONATION_LINKS = {
  "one-time": {
    5: "https://donate.stripe.com/aFafZj78YdcJdM043c6wE0p",
    10: "https://donate.stripe.com/bJe00l9h64GdcHW7fo6wE0o",
    20: "https://donate.stripe.com/9B68wRgJyb4B0Ze1V46wE0n",
    custom: "https://donate.stripe.com/aFafZjgJy2y5azOgPY6wE0q",
  },
  monthly: {
    5: "https://donate.stripe.com/6oU6oJ64U8Wt5fu8js6wE0r",
    10: "https://donate.stripe.com/5kQ9AV8d2egNcHWarA6wE0s",
    20: "https://donate.stripe.com/5kQfZj0KAc8FgYc2Z86wE0t",
    custom: "https://donate.stripe.com/aFafZjgJy2y5azOgPY6wE0q",
  },
} as const;

// Default fallback link ($20 One-time)
export const STRIPE_PAYMENT_LINK = STRIPE_DONATION_LINKS["one-time"][20];

/**
 * Builds the direct Stripe Checkout / Donation URL with prefilled user email, client reference,
 * and exact amount / frequency routing.
 */
export function getCheckoutUrl(
  email?: string,
  userId?: string,
  amount?: number,
  frequency: "one-time" | "monthly" = "one-time"
): string {
  const freq = frequency === "monthly" ? "monthly" : "one-time";
  let targetUrl: string;

  if (amount === 5) {
    targetUrl = STRIPE_DONATION_LINKS[freq][5];
  } else if (amount === 10) {
    targetUrl = STRIPE_DONATION_LINKS[freq][10];
  } else if (amount === 20) {
    targetUrl = STRIPE_DONATION_LINKS[freq][20];
  } else {
    // Custom amount -> use the custom donation link
    targetUrl = STRIPE_DONATION_LINKS[freq].custom;
  }

  try {
    const url = new URL(targetUrl);
    if (email) url.searchParams.set("prefilled_email", email);
    if (userId) url.searchParams.set("client_reference_id", userId);
    if (amount && amount !== 5 && amount !== 10 && amount !== 20 && amount > 0) {
      // In Stripe payment links with custom_unit_amount, prefilled_amount is in cents
      url.searchParams.set("prefilled_amount", String(Math.round(amount * 100)));
    }
    return url.toString();
  } catch {
    return targetUrl;
  }
}

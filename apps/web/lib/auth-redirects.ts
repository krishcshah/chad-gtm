/**
 * Helpers for the email-verification and password-reset landing pages.
 * Only fixed in-app paths are ever returned (no open redirects).
 */

const NEXT_TARGETS: Record<string, string> = {
  dashboard: "/dashboard",
  signup: "/chad-gtm?new_signup=1",
};

/** Where to go after a successful email verification. */
export function verifiedRedirectTarget(next?: string | string[] | null): string {
  const key = Array.isArray(next) ? next[0] : next;
  return (key && NEXT_TARGETS[key]) || NEXT_TARGETS.signup;
}

/** Human message for a better-auth error code passed back as ?error=… */
export function authLinkErrorMessage(code?: string | string[] | null): string | null {
  const value = (Array.isArray(code) ? code[0] : code)?.trim();
  if (!value) return null;
  switch (value.toUpperCase()) {
    case "TOKEN_EXPIRED":
      return "This link has expired.";
    case "INVALID_TOKEN":
      return "This link is invalid or has already been used.";
    case "USER_NOT_FOUND":
      return "We couldn't find an account for this link.";
    default:
      return "This link didn't work.";
  }
}

/** First string value of a search param. */
export function firstParam(value?: string | string[] | null): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

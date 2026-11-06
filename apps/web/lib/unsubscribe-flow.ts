/**
 * Unsubscribe flow rules.
 *
 * - GET never unsubscribes: mail security scanners and link previewers fetch
 *   every URL in a message, so a GET that opts out would unsubscribe people
 *   who never clicked. GET only shows a confirm page.
 * - POST unsubscribes: the confirm button on /unsubscribe, and RFC 8058
 *   one-click (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`) from
 *   mailbox providers, which POST that body to the List-Unsubscribe URL.
 * - Redirects are built from APP_URL, never from the request URL (behind the
 *   proxy that is the internal origin, e.g. https://localhost:3005).
 */

export const UNSUBSCRIBE_STATUSES = ["done", "error"] as const;
export type UnsubscribeStatus = (typeof UNSUBSCRIBE_STATUSES)[number];

/** Public origin for redirects: APP_URL, then BETTER_AUTH_URL, then local dev. */
export function publicAppOrigin(env: Record<string, string | undefined> = process.env): string {
  for (const candidate of [env.APP_URL, env.BETTER_AUTH_URL]) {
    const v = candidate?.trim();
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      // try the next one
    }
  }
  return "http://localhost:3000";
}

/** Absolute /unsubscribe page URL on the public origin. */
export function unsubscribePageUrl(
  params: { token?: string; status?: UnsubscribeStatus } = {},
  env: Record<string, string | undefined> = process.env
): string {
  const url = new URL("/unsubscribe", publicAppOrigin(env));
  if (params.token) url.searchParams.set("token", params.token);
  if (params.status) url.searchParams.set("status", params.status);
  return url.toString();
}

/** Form field the confirm page posts so the API answers with a redirect, not JSON. */
export const UNSUBSCRIBE_CONFIRM_FIELD = "confirm";

/** True for an RFC 8058 one-click body. */
export function isOneClickBody(form: URLSearchParams | null | undefined): boolean {
  return (form?.get("List-Unsubscribe") ?? "").trim().toLowerCase() === "one-click";
}

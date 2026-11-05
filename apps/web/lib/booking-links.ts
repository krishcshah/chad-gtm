/**
 * Booking-link detection.
 *
 * Autopilot needs one thing the website rarely states in prose: where an
 * interested lead should go to book a call. Most B2B sites link (or embed) a
 * scheduling tool in the header "Book a demo" button, so we scan every href,
 * iframe src, and Calendly-style data-url before the crawler strips the nav.
 */

const BOOKING_HOST_PATTERNS: RegExp[] = [
  /(^|\.)calendly\.com$/i,
  /(^|\.)cal\.com$/i,
  /(^|\.)cal\.eu$/i,
  /(^|\.)savvycal\.com$/i,
  /(^|\.)tidycal\.com$/i,
  /(^|\.)zcal\.co$/i,
  /(^|\.)youcanbook\.me$/i,
  /(^|\.)acuityscheduling\.com$/i,
  /(^|\.)as\.me$/i,
  /(^|\.)koalendar\.com$/i,
  /(^|\.)oncehub\.com$/i,
  /(^|\.)chilipiper\.com$/i,
  /(^|\.)reclaim\.ai$/i,
  /(^|\.)motion\.so$/i,
  /(^|\.)usemotion\.com$/i,
  /(^|\.)vyte\.in$/i,
  /(^|\.)doodle\.com$/i,
  /(^|\.)zoho\.com$/i,
  /(^|\.)outlook\.office365\.com$/i,
  /(^|\.)outlook\.office\.com$/i,
  /(^|\.)meetings\.hubspot\.com$/i,
  /(^|\.)meetings-[a-z0-9]+\.hs-sites\.com$/i,
  /(^|\.)calendar\.app\.google$/i,
];

/** Path checks for hosts that serve far more than scheduling pages. */
function pathLooksLikeBooking(host: string, pathname: string): boolean {
  const h = host.toLowerCase();
  const p = pathname.toLowerCase();
  if (h === "calendar.google.com") return p.includes("/appointments") || p.includes("/schedules");
  if (h.endsWith("zoho.com")) return p.includes("bookings") || h.startsWith("bookings.");
  if (h.endsWith("outlook.office365.com") || h.endsWith("outlook.office.com")) {
    return p.includes("/bookwithme") || p.includes("/bookings");
  }
  if (h.endsWith("doodle.com")) return p.includes("/bp/") || p.includes("/mm/");
  if (h.endsWith("calendly.com") || h.endsWith("cal.com") || h.endsWith("cal.eu")) {
    // Bare marketing homepages are not someone's booking page.
    return p.replace(/\/+$/, "").length > 1;
  }
  return true;
}

export function isBookingUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "calendar.google.com") return pathLooksLikeBooking(host, url.pathname);
  if (!BOOKING_HOST_PATTERNS.some((re) => re.test(host))) return false;
  return pathLooksLikeBooking(host, url.pathname);
}

/** Strip tracking params and embed flags so the link is safe to email. */
export function cleanBookingUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|embed_|hide_|background_color|text_color|primary_color|month|date)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString().replace(/\?$/, "");
  } catch {
    return raw.trim();
  }
}

/**
 * Extract candidate booking links from raw HTML (hrefs, iframes, data-url
 * attributes, and bare URLs inside inline scripts such as Calendly.initPopupWidget).
 */
export function extractBookingLinks(html: string, baseUrl?: string): string[] {
  const found = new Set<string>();
  const push = (candidate: string) => {
    let value = candidate.trim().replace(/&amp;/g, "&");
    if (!value) return;
    if (value.startsWith("//")) value = `https:${value}`;
    try {
      value = new URL(value, baseUrl).toString();
    } catch {
      return;
    }
    if (isBookingUrl(value)) found.add(cleanBookingUrl(value));
  };

  const attrRe = /\b(?:href|src|data-url|data-calendly-url|data-cal-link)\s*=\s*["']([^"']+)["']/gi;
  for (const match of html.matchAll(attrRe)) {
    const value = match[1] ?? "";
    // Cal.com data-cal-link is "user/event" without a host.
    if (/^[\w.-]+\/[\w.-]+$/.test(value) && /data-cal-link/i.test(match[0])) {
      push(`https://cal.com/${value}`);
    } else {
      push(value);
    }
  }

  const bareRe = /https?:\/\/[^\s"'<>()\\]+/gi;
  for (const match of html.matchAll(bareRe)) push(match[0]);

  return Array.from(found);
}

/**
 * Pick the most plausible booking link. Prefer links that look like a sales
 * or demo event over generic "15min" coffee chats, and dedicated scheduling
 * hosts over generic calendar hosts.
 */
export function pickBestBookingUrl(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  const score = (u: string) => {
    let s = 0;
    if (/demo|sales|intro|discovery|consult|strategy|meet|call|book/i.test(u)) s += 3;
    if (/calendly|cal\.com|hubspot|savvycal|chilipiper/i.test(u)) s += 2;
    if (/15min|coffee|chat$/i.test(u)) s -= 1;
    return s;
  };
  return [...candidates].sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Validate a client-supplied booking link (any https page is accepted). */
export function normalizeClientBookingUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return cleanBookingUrl(url.toString());
  } catch {
    return null;
  }
}

/**
 * Carries the website a visitor pasted on the landing page through sign-up
 * (and email verification) to the Autopilot launcher, so they never type it
 * twice. Browser storage only; every access is guarded.
 */
const KEY = "autogtm_pending_website";

/** Accepts plain hosts and URLs; returns null for anything that is not a plausible website. */
export function normalizePendingWebsite(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || v.length > 300 || /\s/.test(v)) return null;
  if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(v)) return null;
  return v;
}

export function savePendingWebsite(value: string | null | undefined) {
  const v = normalizePendingWebsite(value);
  if (!v || typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, v);
  } catch {}
}

/** Returns the saved website once, then forgets it. */
export function takePendingWebsite(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = normalizePendingWebsite(localStorage.getItem(KEY));
    localStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

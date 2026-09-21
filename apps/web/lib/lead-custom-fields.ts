/**
 * Merge-patch for lead customFields.
 * - omitted keys are kept
 * - string values upsert
 * - null values delete the key
 */
export function mergeLeadCustomFields(
  existing: Record<string, string> | null | undefined,
  patch: Record<string, string | null>,
): Record<string, string> {
  const next: Record<string, string> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/** Drop keys whose value is `undefined` so drizzle doesn't write them oddly. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

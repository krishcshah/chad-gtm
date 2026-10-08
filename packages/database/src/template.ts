/**
 * Merge-variable renderer.
 *
 *   "Hi {{first_name | \"there\"}}, quick question about {{company}}."
 *
 *  - Unknown variables render as empty string.
 *  - Fallbacks: {{ first_name | "there" }} — quoted or bare.
 *  - Case-insensitive keys, whitespace tolerant.
 */

export interface RenderVars {
  [key: string]: string | null | undefined;
}

const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*(?:\|\s*(?:"([^"]*)"|'([^']*)'|([^}]*?))\s*)?\}\}/g;

export function renderTemplate(template: string, vars: RenderVars): string {
  if (!template) return "";
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) {
    const val = (v ?? "").trim();
    const lk = k.toLowerCase();
    lower[lk] = val;
    lower[lk.replace(/[_-]/g, "")] = val;
  }
  return template.replace(VAR_RE, (_, key: string, dq, sq, bare) => {
    const kLower = key.toLowerCase();
    const value = lower[kLower] ?? lower[kLower.replace(/[_-]/g, "")];
    if (value) return escapeForPlainText(value);
    const fallback = (dq ?? sq ?? bare ?? "").trim();
    return fallback;
  });
}

function escapeForPlainText(v: string): string {
  return v.replace(/\s+/g, " ").trim();
}

/** Extract variable names used in a template. */
export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) found.add(m[1]!.toLowerCase());
  return [...found];
}

/** Validate: every opening must have a closing `}}`. Returns error messages. */
export function validateTemplateSyntax(template: string): string[] {
  const errors: string[] = [];
  const opens = (template.match(/\{\{/g) ?? []).length;
  const closes = (template.match(/\}\}/g) ?? []).length;
  if (opens !== closes) errors.push(`Unbalanced braces: ${opens} "{{" but ${closes} "}}"`);
  return errors;
}

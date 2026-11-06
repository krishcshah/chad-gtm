import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";

export const PRIMARY_VARS = ["first_name", "last_name", "company", "email"] as const;

/** Values used by "Preview with a sample lead" until the user edits them. */
export const SAMPLE_LEAD: Record<string, string> = {
  email: "jordan@northwind.example",
  first_name: "Jordan",
  last_name: "Lee",
  company: "Northwind",
  website: "northwind.example",
  linkedin: "linkedin.com/in/jordanlee",
  job_title: "Head of Sales",
  location: "Austin",
  phone: "+1 512 555 0148",
  industry: "Software",
};

export type Caret = { start: number; end: number };

export function isDenied(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

/** "First Name" -> "First name"; keeps words like "LinkedIn". */
export function sentenceCase(label: string): string {
  return label.replace(/ ([A-Z])([a-z])/g, (_, a: string, b: string) => ` ${a.toLowerCase()}${b}`);
}

export function fieldLabel(key: string): string {
  const label = STANDARD_LEAD_FIELDS.find((field) => field.key === key)?.label;
  return label ? sentenceCase(label) : key;
}

export function fallbackCopy(templateName: string | null, hasTemplate: boolean): string {
  if (templateName) {
    return `With no steps saved, sends use the ${templateName} template.`;
  }
  if (hasTemplate) {
    return "With no steps saved, sends use this campaign’s template.";
  }
  return "With no steps saved, there is no template to fall back to. Add a step, or attach a template when you build the campaign.";
}

export function insertAt(value: string, caret: Caret, token: string): { value: string; caret: Caret } {
  const start = Math.max(0, Math.min(caret.start, value.length));
  const end = Math.max(start, Math.min(caret.end, value.length));
  const next = value.slice(0, start) + token + value.slice(end);
  const pos = start + token.length;
  return { value: next, caret: { start: pos, end: pos } };
}

/** Only http, https and mailto links; bare domains get https://. */
export function safeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

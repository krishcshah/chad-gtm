import type { ReusableSequence, TemplateStepItem } from "@/lib/sequence-templates";

/** Raw template row as the templates page passes it to the client. */
export interface TemplateRow {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  format: string;
  updatedAt: string;
}

export type LibraryKind = "sequence" | "email" | "starter";

/** One entry in the library: a saved sequence, a saved single email, or a starter. */
export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  name: string;
  description: string | null;
  sequence: ReusableSequence;
  format: "text" | "html";
  updatedAt: string | null;
}

/** Link that opens the campaign wizard with this template's steps loaded. */
export function campaignHref(id: string) {
  return `/campaigns/new?sequence=${encodeURIComponent(id)}`;
}

/**
 * Plain names and descriptions for the built-in starters. The stored preset
 * copy makes performance claims we cannot back up, so the library shows these.
 */
const STARTER_COPY: Record<string, { name: string; description: string }> = {
  "preset-b2b-saas": {
    name: "B2B SaaS: deliverability angle",
    description:
      "Three short emails for software buyers. The first email has two openings to A/B test, then a follow-up with a resource and a polite close-out.",
  },
  "preset-agency-client-audit": {
    name: "Agency: website teardown",
    description:
      "Three emails that offer a short video teardown of the prospect's website, then follow up and close out politely.",
  },
  "preset-founder-intro": {
    name: "Founder to founder intro",
    description: "Two very short, low-pressure emails for founders and executives.",
  },
};

export function starterName(seq: ReusableSequence) {
  return STARTER_COPY[seq.id]?.name ?? seq.name;
}

export function starterDescription(seq: ReusableSequence) {
  return STARTER_COPY[seq.id]?.description ?? seq.description ?? null;
}

/** `parseSequenceTemplate` fills in "3-step automated sequence" when none was written. */
export function meaningfulDescription(description: string | null | undefined) {
  const d = description?.trim();
  if (!d) return null;
  if (/^\d+-step (automated|outreach) sequence$/i.test(d)) return null;
  return d;
}

/** Days from the first email to the last one. */
export function spanDays(steps: TemplateStepItem[]) {
  return steps.reduce((sum, s, i) => (i === 0 ? sum : sum + (Number(s.delayDays) || 0)), 0);
}

export function hasAbTest(steps: TemplateStepItem[]) {
  return steps.some((s) => (s.variants?.length ?? 0) > 1);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "3 emails over 7 days" */
export function sequenceSummary(steps: TemplateStepItem[]) {
  const n = steps.length;
  const days = spanDays(steps);
  return days > 0 ? `${plural(n, "email")} over ${plural(days, "day")}` : plural(n, "email");
}

export function wordCount(text: string | null | undefined) {
  const t = (text ?? "").trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Rough text version of an HTML body, for previews of HTML-only templates. */
export function htmlToText(html: string | null | undefined) {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Body text of a variant, falling back to the HTML body as text. */
export function variantBody(v: { bodyText?: string; bodyHtml?: string } | undefined) {
  if (!v) return "";
  return v.bodyText?.trim() ? v.bodyText : htmlToText(v.bodyHtml);
}

export function firstSubject(seq: ReusableSequence) {
  return seq.steps[0]?.variants[0]?.subject?.trim() || "";
}

export function matchesQuery(item: LibraryItem, q: string) {
  if (!q) return true;
  const hay = [item.name, item.description ?? "", ...item.sequence.steps.flatMap((s) => s.variants.map((v) => v.subject))]
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

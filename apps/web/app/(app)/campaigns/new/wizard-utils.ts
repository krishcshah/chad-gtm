import type { DraftStep } from "@/lib/sequence-draft";
import type { ReusableSequence } from "@/lib/sequence-templates";
import { LAST_STEP } from "./wizard-types";

/** Sample values used when the review step shows emails "as a lead sees them". */
export const SAMPLE_LEAD: Record<string, string> = {
  first_name: "Jordan",
  last_name: "Lee",
  company: "Northwind",
  email: "jordan@northwind.example",
  website: "northwind.example",
  job_title: "Head of Growth",
};

export function clampStep(step: number | null | undefined) {
  if (!step || step < 1) return 1;
  return Math.min(LAST_STEP, step);
}

export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → readable local date and time, or "" when empty/invalid. */
export function formatLocalDateTime(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function renderWithSampleLead(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|[^}]+)?\}\}/g, (match, key: string) => {
    return SAMPLE_LEAD[key] || match;
  });
}

/** The HTML body the composer stores next to the plain text (same shape the engine has always received). */
export function bodyHtmlFromText(text: string): string {
  return `<p>${text.replace(/\n/g, "<br>")}</p>`;
}

/** Turn a saved or preset sequence into editable draft steps. */
export function sequenceToDraftSteps(seq: ReusableSequence): DraftStep[] {
  const stamp = Date.now();
  return seq.steps.map((st, idx) => ({
    key: `step-${stamp}-${idx}`,
    delayDays: idx === 0 ? 0 : (st.delayDays ?? 3),
    type: idx === 0 ? "initial" : "follow_up",
    variants:
      st.variants && st.variants.length > 0
        ? st.variants.map((v, vi) => ({
            key: `var-${stamp}-${idx}-${vi}`,
            label: (vi === 0 ? "A" : "B") as "A" | "B",
            subject: v.subject || "",
            bodyText: v.bodyText || "",
            bodyHtml: v.bodyHtml || (v.bodyText ? bodyHtmlFromText(v.bodyText) : ""),
            weight: 50,
            pausedAt: null,
            plainEdited: false,
            aiGenerateOnTheFly: v.aiGenerateOnTheFly,
            aiPrompt: v.aiPrompt,
          }))
        : [
            {
              key: `var-${stamp}-${idx}-0`,
              label: "A" as const,
              subject: "",
              bodyText: "",
              bodyHtml: "",
              weight: 50,
              pausedAt: null,
              plainEdited: false,
            },
          ],
  }));
}

/** "Initial email" for the first step, "Follow-up n" after it. */
export function stepTitle(index: number) {
  return index === 0 ? "Initial email" : `Follow-up ${index}`;
}

/** Days from the first email to the last one. */
export function sequenceSpanDays(steps: DraftStep[]) {
  return steps.slice(1).reduce((sum, s) => sum + (Number.isFinite(s.delayDays) ? s.delayDays : 0), 0);
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * Client-side draft model for the campaign sequence editor.
 * Save payloads match saveCampaignSequence (replace-all). No API changes.
 */
import { MAX_SEQUENCE_STEPS } from "@smartreach/shared";

export const MAX_SEQUENCE_STEP_COUNT = MAX_SEQUENCE_STEPS;

export type StepType = "initial" | "follow_up";

export type VariantSource = {
  id: string;
  label: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  weight: number;
  pausedAt: string | null;
  aiGenerateOnTheFly?: boolean;
  aiPrompt?: string;
};

export type StepSource = {
  id: string;
  position: number;
  delayDays: number;
  type: StepType;
  variants: VariantSource[];
};

export type DraftVariant = {
  key: string;
  id?: string;
  label: "A" | "B";
  subject: string;
  bodyHtml: string;
  bodyText: string;
  weight: number;
  pausedAt: string | null;
  /** Visual edits leave bodyText alone once the plain version was edited on purpose. */
  plainEdited: boolean;
  aiGenerateOnTheFly?: boolean;
  aiPrompt?: string;
};

export type DraftStep = {
  key: string;
  id?: string;
  delayDays: number;
  type: StepType;
  variants: DraftVariant[];
};

export type SequenceSavePayload = {
  campaignId: string;
  steps: Array<{
    id?: string;
    position: number;
    delayDays: number;
    type: StepType;
    variants: Array<{
      id?: string;
      label: "A" | "B";
      subject: string;
      bodyHtml: string;
      bodyText: string;
      weight: number;
      pausedAt: string | null;
      aiGenerateOnTheFly?: boolean;
      aiPrompt?: string;
    }>;
  }>;
};

export function newDraftKey(): string {
  return crypto.randomUUID();
}

export function clampDelayDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(365, Math.max(0, Math.trunc(value)));
}

export function plainFromHtml(html: string): string {
  if (!html.trim()) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const blocks = escaped.split(/\n{2,}/);
  return blocks.map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`).join("");
}

function normalizePlain(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function blankVariant(label: "A" | "B"): DraftVariant {
  return {
    key: newDraftKey(),
    label,
    subject: "",
    bodyHtml: "",
    bodyText: "",
    weight: 50,
    pausedAt: null,
    plainEdited: false,
    aiGenerateOnTheFly: false,
    aiPrompt: "",
  };
}

export function blankStep(position: number): DraftStep {
  return {
    key: newDraftKey(),
    delayDays: position <= 1 ? 0 : 3,
    type: position <= 1 ? "initial" : "follow_up",
    variants: [blankVariant("A")],
  };
}

export function stepsFromDto(steps: StepSource[]): DraftStep[] {
  return steps.map((step) => {
    const source = step.variants.slice(0, 2);
    const variants =
      source.length === 0
        ? [blankVariant("A")]
        : source.map((variant, index) => {
            const label: "A" | "B" = index === 0 ? "A" : "B";
            const bodyHtml = variant.bodyHtml ?? "";
            const bodyText = variant.bodyText ?? "";
            const derived = normalizePlain(plainFromHtml(bodyHtml));
            const plain = normalizePlain(bodyText);
            return {
              key: variant.id || newDraftKey(),
              id: variant.id,
              label,
              subject: variant.subject ?? "",
              bodyHtml,
              bodyText,
              weight: source.length === 2 ? 50 : variant.weight || 50,
              pausedAt: variant.pausedAt ?? null,
              plainEdited: plain.length > 0 && plain !== derived,
              aiGenerateOnTheFly: Boolean(variant.aiGenerateOnTheFly),
              aiPrompt: variant.aiPrompt ?? "",
            };
          });
    return {
      key: step.id,
      id: step.id,
      delayDays: clampDelayDays(step.delayDays),
      type: step.type === "follow_up" ? "follow_up" : "initial",
      variants,
    };
  });
}

export function addStep(steps: DraftStep[]): { steps: DraftStep[]; error?: string } {
  if (steps.length >= MAX_SEQUENCE_STEP_COUNT) {
    return {
      steps,
      error: `A sequence can have at most ${MAX_SEQUENCE_STEP_COUNT} steps.`,
    };
  }
  return { steps: [...steps, blankStep(steps.length + 1)] };
}

export function removeStep(steps: DraftStep[], index: number): DraftStep[] {
  if (index < 0 || index >= steps.length) return steps;
  return steps.filter((_, i) => i !== index);
}

export function moveStep(steps: DraftStep[], index: number, direction: -1 | 1): DraftStep[] {
  const next = index + direction;
  if (index < 0 || index >= steps.length || next < 0 || next >= steps.length) return steps;
  const copy = steps.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item!);
  return copy;
}

export function addVariant(step: DraftStep): DraftStep {
  if (step.variants.length >= 2) return step;
  const first = step.variants[0] ?? blankVariant("A");
  return {
    ...step,
    variants: [
      { ...first, label: "A", weight: 50 },
      {
        ...blankVariant("B"),
        subject: first.subject,
        bodyHtml: first.bodyHtml,
        bodyText: first.bodyText,
        plainEdited: first.plainEdited,
        weight: 50,
        aiGenerateOnTheFly: first.aiGenerateOnTheFly,
        aiPrompt: first.aiPrompt,
      },
    ],
  };
}

export function removeVariant(step: DraftStep, index: number): DraftStep {
  if (step.variants.length < 2) return step;
  const kept = step.variants.find((_, i) => i !== index) ?? step.variants[0]!;
  return {
    ...step,
    variants: [{ ...kept, label: "A", weight: kept.weight || 50 }],
  };
}

export function validateDraft(steps: DraftStep[]): string | null {
  if (steps.length > MAX_SEQUENCE_STEP_COUNT) {
    return `A sequence can have at most ${MAX_SEQUENCE_STEP_COUNT} steps.`;
  }
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.variants.length < 1 || step.variants.length > 2) {
      return `Step ${i + 1} needs one variant, or two for an equal A/B split.`;
    }
    if (!Number.isInteger(step.delayDays) || step.delayDays < 0 || step.delayDays > 365) {
      return `Step ${i + 1}: wait must be a whole number of calendar days from 0 to 365.`;
    }
    for (const variant of step.variants) {
      if (variant.subject.length > 500) {
        return `Step ${i + 1} variant ${variant.label}: subject must be 500 characters or fewer.`;
      }
    }
  }
  return null;
}

export function toSavePayload(campaignId: string, steps: DraftStep[]): SequenceSavePayload {
  return {
    campaignId,
    steps: steps.map((step, index) => ({
      ...(step.id ? { id: step.id } : {}),
      position: index + 1,
      delayDays: clampDelayDays(step.delayDays),
      type: step.type,
      variants: step.variants.slice(0, 2).map((variant, variantIndex) => {
        const two = step.variants.length >= 2;
        return {
          ...(variant.id ? { id: variant.id } : {}),
          label: two ? (variantIndex === 0 ? "A" : "B") : "A",
          subject: variant.subject,
          bodyHtml: variant.bodyHtml,
          bodyText: variant.bodyText,
          weight: two ? 50 : variant.weight || 50,
          pausedAt: variant.pausedAt,
          aiGenerateOnTheFly: Boolean(variant.aiGenerateOnTheFly),
          aiPrompt: variant.aiPrompt || "",
        };
      }),
    })),
  };
}

export function payloadKey(payload: SequenceSavePayload): string {
  return JSON.stringify(payload);
}

export function waitLabel(delayDays: number, index: number): string {
  if (index === 0 && delayDays === 0) return "Sends first";
  if (delayDays === 0) return "No extra wait";
  if (delayDays === 1) return "Waits 1 calendar day";
  return `Waits ${delayDays} calendar days`;
}

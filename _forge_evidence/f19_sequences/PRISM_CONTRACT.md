# F19 Sequences — Prism contract (API only)

Thin Must: steps + calendar wait days + equal A/B + `{{vars}}` + `{a|b}` spintax + preview.
**No** content score, AI compose, subsequences, tracking gizmos, code-view.

## Defaults / assumptions
- Wait = **calendar** days (`delayDays` on the step being waited for; step 1 typically `0`).
- A/B = equal weight **50/50** when 2 active (non-paused) variants; 1 variant = always that one; max 2 variants/step.
- Max **20** steps (`MAX_SEQUENCE_STEPS`).
- No standalone `sequences` table — steps hang off `campaignId`.
- When a campaign has ≥1 `sequence_steps`, engine prefers them over `campaign.templateId`. Empty steps ⇒ template fallback.
- Spintax + vars expanded at **enqueue** (send-prep). Preview uses the same pipeline:  `{{vars}}` → spintax.
- `email_jobs` unique is `(campaign_lead_id, step_position)` so multi-step can enqueue.

## Server actions

```ts
getCampaignSequence(campaignId: string)
  → ActionResult<SequenceDTO>

saveCampaignSequence(input: SequenceSaveInput)
  → ActionResult<SequenceDTO>   // replace-all for step rail

previewSequenceStep(input: SequencePreviewInput)
  → ActionResult<{ subject; bodyHtml; bodyText }>
```

## Shapes

```ts
type SequenceDTO = {
  campaignId: string;
  steps: SequenceStepDTO[];
};

type SequenceStepDTO = {
  id: string;
  position: number;          // 1-based
  delayDays: number;         // calendar days before this step
  type: "initial" | "follow_up";
  variants: SequenceVariantDTO[]; // 1..2
};

type SequenceVariantDTO = {
  id: string;
  label: string;             // "A" | "B"
  subject: string;
  bodyHtml: string;
  bodyText: string;
  weight: number;            // forced 50 when 2 variants on save
  pausedAt: string | null;
};

// Save (replace-all)
type SequenceSaveInput = {
  campaignId: string;
  steps: Array<{
    id?: string;
    position?: number;
    delayDays?: number;      // default 0
    type?: "initial" | "follow_up";
    variants: Array<{
      id?: string;
      label?: string;        // default "A"; forced A/B when 2
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      weight?: number;
      pausedAt?: string | null;
    }>; // min 1, max 2
  }>; // max 20; [] clears sequence
};

// Preview
type SequencePreviewInput = {
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  sampleVars?: Record<string, string>;
};
```

## Engine behavior
1. Claim `campaign_leads` with `status=queued` and (`scheduledFor` null/'' OR `scheduledFor <= now`).
2. Resolve step at `campaign_leads.stepPosition` → pick variant → expand spintax → render vars → insert `email_jobs` with `stepPosition` / `sequenceStepId` / `variantId`.
3. On send success: if next step exists, requeue lead (`status=queued`, `stepPosition++`, `scheduledFor = sentAt + next.delayDays` calendar); else mark `sent`.

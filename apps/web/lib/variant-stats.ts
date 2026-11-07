/**
 * Per-step A/B variant results for the campaign Sequence tab. Pure: the rows
 * come from getVariantStatsForCampaign (lib/analytics.ts).
 *
 * Rates are per lead (a lead who got the email twice counts once). Reply rate
 * only counts replies that came in after that email was sent.
 */

/** One (step, variant) group of sent, non-dry-run email jobs. */
export type VariantStatRow = {
  stepPosition: number;
  variantId: string;
  /** Null when the variant was deleted since (shown as "Earlier version"). */
  label: string | null;
  pausedAt: string | null;
  sent: number;
  leads: number;
  opened: number;
  replied: number;
};

export type VariantSummary = {
  variantId: string;
  label: string;
  sent: number;
  leads: number;
  /** Percent of leads who opened; null when open tracking is off. */
  openRate: number | null;
  /** Percent of leads who replied after this email. */
  replyRate: number;
  paused: boolean;
};

export type VariantStepSummary = {
  stepPosition: number;
  variants: VariantSummary[];
  /** Variant id with the higher reply rate, only once there is enough data to call it. */
  leader: string | null;
  /** True while some variant has fewer than MIN_SENDS_TO_CALL leads. */
  tooEarly: boolean;
};

/** Leads each variant needs before we point at a leader. */
export const MIN_SENDS_TO_CALL = 50;

export const EARLIER_VERSION_LABEL = "Earlier version";

function rate(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function summarizeVariantStats(
  rows: ReadonlyArray<VariantStatRow>,
  { trackOpens }: { trackOpens: boolean },
): VariantStepSummary[] {
  const byStep = new Map<number, VariantStatRow[]>();
  for (const row of rows) {
    const list = byStep.get(row.stepPosition) ?? [];
    list.push(row);
    byStep.set(row.stepPosition, list);
  }

  const steps: VariantStepSummary[] = [];
  for (const [stepPosition, list] of [...byStep.entries()].sort((a, b) => a[0] - b[0])) {
    if (list.length < 2) continue;
    const variants: VariantSummary[] = list
      .map((row) => {
        const leads = Number(row.leads) || 0;
        return {
          variantId: row.variantId,
          label: row.label?.trim() || EARLIER_VERSION_LABEL,
          sent: Number(row.sent) || 0,
          leads,
          openRate: trackOpens ? rate(Number(row.opened) || 0, leads) : null,
          replyRate: rate(Number(row.replied) || 0, leads),
          paused: Boolean(row.pausedAt),
        };
      })
      .sort((a, b) => {
        // Current variants (A, B, …) first, deleted ones last.
        const ae = a.label === EARLIER_VERSION_LABEL;
        const be = b.label === EARLIER_VERSION_LABEL;
        if (ae !== be) return ae ? 1 : -1;
        return a.label.localeCompare(b.label);
      });

    const tooEarly = variants.some((v) => v.leads < MIN_SENDS_TO_CALL);
    let leader: string | null = null;
    if (!tooEarly) {
      const best = Math.max(...variants.map((v) => v.replyRate));
      const top = variants.filter((v) => v.replyRate === best);
      // Only a single clear leader counts; equal rates are not a result.
      if (top.length === 1) leader = top[0]!.variantId;
    }
    steps.push({ stepPosition, variants, leader, tooEarly });
  }
  return steps;
}

/** Percent with one decimal below 10%, whole numbers above (docs/DESIGN.md). */
export function formatRate(value: number): string {
  if (value > 0 && value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

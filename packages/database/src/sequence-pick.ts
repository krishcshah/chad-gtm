/** Equal-weight A/B pick among non-paused variants (50/50 when two). */
export function pickVariantEqualWeight<
  T extends { weight: number; pausedAt?: string | null },
>(variants: T[], rand: () => number = Math.random): T | null {
  const active = variants.filter((v) => !v.pausedAt);
  if (active.length === 0) return null;
  if (active.length === 1) return active[0]!;
  const total = active.reduce((s, v) => s + (v.weight || 50), 0);
  let r = rand() * total;
  for (const v of active) {
    r -= v.weight || 50;
    if (r <= 0) return v;
  }
  return active[active.length - 1]!;
}

/** Render {{vars}} then expand {a|b} spintax — send-prep + preview. */
export function renderSequenceContent(
  text: string,
  vars: Record<string, string | null | undefined>,
  expandSpintax: (s: string) => string,
  renderTemplate: (s: string, v: Record<string, string | null | undefined>) => string,
): string {
  return expandSpintax(renderTemplate(text, vars));
}

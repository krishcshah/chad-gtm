/** Percent with one decimal below 10%, whole numbers above (docs/DESIGN.md). */
export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const value = (part / whole) * 100;
  if (value > 0 && value < 10) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

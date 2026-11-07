"use client";

import { useId, useState } from "react";

const STEPS = [500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000];

/**
 * Slider that turns a monthly email volume into a cost. `centsPerEmail` comes
 * from the page so the number always matches the published price.
 */
export function PricingEstimator({ centsPerEmail }: { centsPerEmail: number }) {
  const id = useId();
  const [index, setIndex] = useState(3);
  const emails = STEPS[index];
  const dollars = (emails * centsPerEmail) / 100;

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-[13px] text-muted-foreground">
          Delivered emails a month
        </label>
        <span className="tabular text-[15px] font-medium text-foreground">{emails.toLocaleString("en-US")}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={STEPS.length - 1}
        step={1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-valuetext={`${emails.toLocaleString("en-US")} emails`}
        className="mt-4 w-full accent-[var(--brand)]"
      />
      <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <span className="text-[13px] text-muted-foreground">You pay</span>
        <span className="tabular text-3xl font-semibold tracking-tight text-foreground">
          ${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
        </span>
      </div>
    </div>
  );
}

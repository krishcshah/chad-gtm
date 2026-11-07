"use client";

import { useId, useState } from "react";

/** The same range the app offers for a campaign's daily volume. */
const PER_DAY = [30, 60, 100, 150, 200, 300, 400, 500];
/** Sending runs Monday to Friday. */
const WEEKDAYS_PER_MONTH = 22;
/** Outreach plus two follow-ups. */
const EMAILS_PER_LEAD = 3;

/**
 * Emails per day → emails a month, leads contacted and cost. Follow-ups count
 * as emails, so leads contacted is a third of emails sent. `centsPerEmail`
 * comes from the page so the number always matches the published price.
 */
export function PricingEstimator({ centsPerEmail }: { centsPerEmail: number }) {
  const id = useId();
  const [index, setIndex] = useState(2);
  const perDay = PER_DAY[index]!;
  const perMonth = perDay * WEEKDAYS_PER_MONTH;
  const leads = Math.round(perMonth / EMAILS_PER_LEAD);
  const dollars = (perMonth * centsPerEmail) / 100;
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-5">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-[13px] text-muted-foreground">
          Emails per day
        </label>
        <span className="tabular text-[15px] font-medium text-foreground">{fmt(perDay)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={PER_DAY.length - 1}
        step={1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-valuetext={`${fmt(perDay)} emails per day`}
        className="mt-4 w-full accent-[var(--brand)]"
      />
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-[13px]">
        <div>
          <dt className="text-muted-foreground">Emails a month</dt>
          <dd className="tabular mt-0.5 text-[15px] font-medium text-foreground">{fmt(perMonth)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Leads contacted</dt>
          <dd className="tabular mt-0.5 text-[15px] font-medium text-foreground">about {fmt(leads)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-border pt-4">
        <span className="text-[13px] text-muted-foreground">You pay</span>
        <span className="tabular text-3xl font-semibold tracking-tight text-foreground">
          ${fmt(Math.round(dollars))}
          <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>
        </span>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-subtle-foreground">
        {WEEKDAYS_PER_MONTH} sending days a month. Each lead gets {EMAILS_PER_LEAD} emails, and every one counts.
      </p>
    </div>
  );
}

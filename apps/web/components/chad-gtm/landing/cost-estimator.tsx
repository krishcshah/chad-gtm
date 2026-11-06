"use client";

import { useId, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, SegmentedControl } from "@smartreach/ui";

/** 5¢ per delivered email, no platform fee. */
const PRICE_PER_EMAIL = 0.05;
/** Autopilot sequences are an opener and two follow-ups. */
const EMAILS_PER_LEAD = 3;
const MIN = 1_000;
const MAX = 50_000;
const STEP = 500;
const PRESETS = ["1000", "3000", "6000", "12000", "25000"] as const;

function usd(value: number): string {
  // Set both bounds: a max below the currency's default min throws in older browsers.
  const digits = value % 1 === 0 ? 0 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Monthly bill for a chosen volume. Pure pricing arithmetic, no comparisons. */
export function CostEstimator() {
  const [volume, setVolume] = useState(6_000);
  const sliderId = useId();

  const cost = volume * PRICE_PER_EMAIL;
  const leads = Math.ceil(volume / EMAILS_PER_LEAD);
  const preset = (PRESETS as readonly string[]).includes(String(volume)) ? String(volume) : "";

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Estimate your bill</CardTitle>
        <CardDescription>Pick how many emails you expect to deliver in a month.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6">
        <SegmentedControl
          aria-label="Common monthly volumes"
          size="sm"
          value={preset}
          onValueChange={(v) => setVolume(Number(v))}
          options={PRESETS.map((p) => ({ value: p, label: `${Number(p) / 1000}k` }))}
          className="self-start"
        />

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={sliderId} className="text-[13px] text-muted-foreground">
              Emails delivered per month
            </label>
            <span className="tabular text-sm font-medium">{volume.toLocaleString("en-US")}</span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-valuetext={`${volume.toLocaleString("en-US")} emails`}
            className="h-2 w-full cursor-pointer accent-brand"
          />
          <div className="flex justify-between text-xs text-subtle-foreground">
            <span className="tabular">{MIN.toLocaleString("en-US")}</span>
            <span className="tabular">{MAX.toLocaleString("en-US")}</span>
          </div>
        </div>

        <dl className="divide-y divide-border border-y border-border text-[13px]">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Leads reached</dt>
            <dd className="tabular font-medium">about {leads.toLocaleString("en-US")}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Platform fee</dt>
            <dd className="tabular font-medium">$0</dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">Delivered emails at 5¢</dt>
            <dd className="tabular font-medium">{usd(cost)}</dd>
          </div>
        </dl>

        <div className="mt-auto flex items-end justify-between gap-4" aria-live="polite">
          <span className="text-sm text-muted-foreground">Estimated monthly total</span>
          <span className="tabular text-3xl font-semibold tracking-[-0.03em]">{usd(cost)}</span>
        </div>
        <p className="-mt-3 text-xs text-subtle-foreground">
          Leads reached assumes the three-email sequence autopilot uses. You are only charged for delivered
          emails.
        </p>
      </CardContent>
    </Card>
  );
}

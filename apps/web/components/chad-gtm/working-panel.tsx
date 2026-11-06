"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@smartreach/ui";

/** "acme.com" from "https://www.acme.com/pricing"; falls back to the raw input. */
export function hostOf(raw: string | null | undefined): string {
  const value = (raw || "").trim();
  if (!value) return "your website";
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

function useElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return seconds;
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Honest waiting state for a long server call: what is being done and how
 * long it has taken so far. No fake progress: the server reports nothing
 * until it finishes, so steps are listed, not ticked off.
 */
export function WorkingPanel({
  title,
  description,
  steps,
  children,
}: {
  title: string;
  description: React.ReactNode;
  steps?: string[];
  children?: React.ReactNode;
}) {
  const elapsed = useElapsedSeconds();
  return (
    <Card aria-busy="true">
      <div className="flex items-start gap-4 p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </span>
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
            <span className="tabular text-xs text-subtle-foreground" aria-hidden>
              {formatElapsed(elapsed)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {steps && steps.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">What happens during this step</p>
          <ol className="mt-2 flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s} className="flex items-start gap-3 text-[13px]">
                <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                  {i + 1}
                </span>
                <span className="pt-px text-foreground">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {children}
    </Card>
  );
}

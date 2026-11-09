import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@smartreach/ui";
import { audienceRunwayLine, type AudienceSummary } from "@/lib/audience-summary";

const n = (v: number) => v.toLocaleString("en-US");

/** Prospects stat: the whole matching audience, not the batch loaded so far. */
export function prospectsStat(
  audience: AudienceSummary | null,
  fallback: { loaded: number; roleMatches?: number | null },
): { value: string; hint: string } {
  if (!audience || audience.kind === "batch") {
    // Older run: only what was loaded at launch is known.
    return {
      value: n(fallback.loaded),
      hint:
        typeof fallback.roleMatches === "number" ? `${n(fallback.roleMatches)} match your roles` : "Matched leads",
    };
  }
  if (audience.counting || audience.matching === null) {
    return { value: "Counting", hint: `${n(audience.emailed)} emailed so far` };
  }
  if (audience.usedUp) return { value: n(audience.matching), hint: `${n(audience.emailed)} emailed · nobody left to start` };
  return {
    value: n(audience.matching),
    hint: `${n(audience.emailed)} emailed · about ${n(audience.toCome ?? 0)} to come`,
  };
}

/** Who the run emails: every matching contact, by priority, with what is done and what is left. */
export function AudienceCard({ audience, perDay }: { audience: AudienceSummary | null; perDay: number }) {
  if (!audience) return null;
  if (audience.kind === "batch") {
    return (
      <Card data-testid="audience-card">
        <CardHeader>
          <CardTitle>Who we&apos;re emailing</CardTitle>
          <CardDescription>
            This run started before AutoGTM counted everyone who matches, so these are the contacts added so far:{" "}
            {n(audience.emailed)} emailed, {n(audience.waiting)} waiting for their first email.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const runway = audienceRunwayLine(audience, perDay);
  return (
    <Card data-testid="audience-card">
      <CardHeader>
        <CardTitle>Who we&apos;re emailing</CardTitle>
        <CardDescription>
          {audience.counting
            ? "Still counting everyone who matches. Sending has already started."
            : `${n(audience.matching ?? 0)} contacts match. We email all of them, in this order.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-2">
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {audience.tiers.map((t) => (
            <li key={t.tier} className="flex flex-col gap-1 px-3 py-2.5 text-[13px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <span className="min-w-0">
                <span className="text-xs text-subtle-foreground">Priority {t.tier}</span>
                <span className="block font-medium">{t.label}</span>
              </span>
              <span className="tabular shrink-0 text-muted-foreground">
                {t.matching === null ? "counting" : `${n(t.matching)} match`} · {n(t.emailed)} emailed
                {t.toCome === null ? "" : t.toCome === 0 ? " · done" : ` · ${n(t.toCome)} to come`}
              </span>
            </li>
          ))}
        </ol>
        {runway ? <p className="text-xs leading-relaxed text-muted-foreground">{runway}</p> : null}
        <p className="text-xs leading-relaxed text-subtle-foreground">
          Counts are close estimates. People anyone contacted in the last 90 days and opted-out addresses are skipped.
        </p>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  SegmentedControl,
} from "@smartreach/ui";
import type { CalibrationProfile } from "@/lib/chad-gtm-actions";
import type { EmailCalibrationSample } from "@/components/chad-gtm/swipe-card";
import { WorkingPanel } from "./working-panel";

interface CalibrationRefinementViewProps {
  isRefining: boolean;
  profile: CalibrationProfile | null;
  refinedSamples: EmailCalibrationSample[];
  approvedCount: number;
  rejectedCount: number;
  onProceedToLaunch: () => void;
  onRecalibrate: () => void;
}

/**
 * Guided setup, step 4 (result): the voice we learned from the reviewed
 * samples and the rewritten emails. Shows only what the model returned;
 * nothing is filled in when refinement failed.
 */
export function CalibrationRefinementView({
  isRefining,
  profile,
  refinedSamples,
  approvedCount,
  rejectedCount,
  onProceedToLaunch,
  onRecalibrate,
}: CalibrationRefinementViewProps) {
  const [preview, setPreview] = useState("template");

  if (isRefining) {
    return (
      <WorkingPanel
        title="Rewriting your emails"
        description={`We're comparing the ${approvedCount} ${approvedCount === 1 ? "email" : "emails"} you approved with the ${rejectedCount} you rejected, then adjusting tone, length and the call to action to match.`}
      />
    );
  }

  const samples = refinedSamples.slice(0, 2);
  const hasTemplate = !!(profile?.calibratedSubjectTemplate || profile?.calibratedBodyTemplate);
  const options = [
    ...(hasTemplate ? [{ value: "template", label: "Template" }] : []),
    ...samples.map((_, i) => ({ value: String(i), label: `Example ${i + 1}` })),
  ];
  const active = options.some((o) => o.value === preview) ? preview : options[0]?.value;
  const sample = active && active !== "template" ? samples[Number(active)] : null;

  const dos = profile?.dos ?? [];
  const donts = profile?.donts ?? [];
  const adjustments = profile?.keyAdjustments ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your email voice</CardTitle>
        <CardDescription>
          Learned from {approvedCount} approved and {rejectedCount} rejected samples. Every email in the campaign
          follows it and is personalized for its recipient.
        </CardDescription>
      </CardHeader>

      <div className="mt-5 divide-y divide-border border-t border-border">
        {!profile ? (
          <div className="p-5">
            <Alert variant="warning">
              We couldn&apos;t learn a voice from your feedback this time. The emails you approved will be used as
              written. You can review the samples again to retry.
            </Alert>
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-3 p-5" aria-labelledby="voice-summary">
              <h3 id="voice-summary" className="text-sm font-semibold">
                {profile.voiceTone || "Your tone"}
              </h3>
              {profile.analysisSummary && (
                <p className="text-sm leading-relaxed text-muted-foreground">{profile.analysisSummary}</p>
              )}
              {adjustments.length > 0 && (
                <ul className="mt-1 flex list-disc flex-col gap-1.5 pl-5 text-[13px] marker:text-subtle-foreground">
                  {adjustments.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </section>

            {(dos.length > 0 || donts.length > 0) && (
              <section className="grid sm:grid-cols-2 sm:divide-x sm:divide-border" aria-label="Writing rules">
                <RuleList title="Keep doing" items={dos} tone="do" />
                <RuleList title="Avoid" items={donts} tone="dont" />
              </section>
            )}
          </>
        )}

        {options.length > 0 && (
          <section className="flex flex-col gap-3 p-5" aria-labelledby="voice-preview">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="voice-preview" className="text-sm font-semibold">
                Preview
              </h3>
              {options.length > 1 && (
                <SegmentedControl
                  size="sm"
                  aria-label="Choose what to preview"
                  value={active!}
                  onValueChange={setPreview}
                  options={options}
                />
              )}
            </div>
            <article className="rounded-lg border border-border bg-muted/40 p-4">
              {sample ? (
                <p className="mb-2 text-xs text-subtle-foreground">
                  To {sample.recipientName}
                  {sample.recipientTitle ? `, ${sample.recipientTitle}` : ""}
                  {sample.recipientCompany ? ` at ${sample.recipientCompany}` : ""}
                </p>
              ) : (
                <p className="mb-2 text-xs text-subtle-foreground">
                  Placeholders in double braces are filled in for each lead.
                </p>
              )}
              <p className="text-sm font-medium">{sample ? sample.subject : profile?.calibratedSubjectTemplate}</p>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                {sample ? sample.bodyText : profile?.calibratedBodyTemplate}
              </p>
            </article>
          </section>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" onClick={onRecalibrate}>
          <RotateCcw />
          Review samples again
        </Button>
        <Button onClick={onProceedToLaunch}>
          Continue to launch
          <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}

function RuleList({ title, items, tone }: { title: string; items: string[]; tone: "do" | "dont" }) {
  const Icon = tone === "do" ? Check : X;
  return (
    <div className="p-5">
      <h4 className="text-xs text-muted-foreground">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-subtle-foreground">Nothing specific.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px]">
              <Icon
                className={tone === "do" ? "mt-0.5 size-4 shrink-0 text-success-text" : "mt-0.5 size-4 shrink-0 text-destructive-text"}
                aria-hidden
              />
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

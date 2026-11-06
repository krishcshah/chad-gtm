"use client";

import { useState } from "react";
import { ArrowRight, Check, Pencil } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Textarea,
  cn,
} from "@smartreach/ui";
import type { BusinessOverview, IcpProfile, GtmOffer } from "@/lib/chad-gtm-research";

/**
 * Guided setup, step 2: what the research found. The summary and the chosen
 * pitch are editable; everything here is saved when the user continues.
 */
export function StrategyReviewBoard({
  companyName,
  initialOverview,
  initialIcp,
  initialOffers,
  initialOfferIndex = 0,
  onConfirm,
}: {
  companyName: string;
  initialOverview: BusinessOverview;
  initialIcp: IcpProfile;
  initialOffers: GtmOffer[];
  initialOfferIndex?: number;
  onConfirm: (data: {
    businessOverview: BusinessOverview;
    icpProfile: IcpProfile;
    offers: GtmOffer[];
    selectedOfferIndex: number;
  }) => void | Promise<void>;
}) {
  const [overview, setOverview] = useState<BusinessOverview>(initialOverview);
  const [icp] = useState<IcpProfile>(initialIcp);
  const [offers, setOffers] = useState<GtmOffer[]>(initialOffers);
  const [selectedOfferIndex, setSelectedOfferIndex] = useState(
    initialOfferIndex < initialOffers.length ? initialOfferIndex : 0,
  );
  const [editingOverview, setEditingOverview] = useState(false);
  const [summaryText, setSummaryText] = useState(initialOverview.summary);
  const [saving, setSaving] = useState(false);

  const offer = offers[selectedOfferIndex];

  const updateOffer = (field: "valueProp" | "cta", value: string) => {
    setOffers((prev) => prev.map((o, i) => (i === selectedOfferIndex ? { ...o, [field]: value } : o)));
  };

  const confirm = async () => {
    setSaving(true);
    try {
      await onConfirm({ businessOverview: overview, icpProfile: icp, offers, selectedOfferIndex });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Here&apos;s what we found about {companyName}</CardTitle>
        <CardDescription>Check the summary and pick the pitch you want leads to hear. You can edit both.</CardDescription>
      </CardHeader>

      <div className="mt-5 divide-y divide-border border-t border-border">
        {/* What you sell */}
        <section className="flex flex-col gap-4 p-5" aria-labelledby="strategy-business">
          <div className="flex items-center justify-between gap-3">
            <h3 id="strategy-business" className="text-sm font-semibold">
              What you sell
            </h3>
            {!editingOverview && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setSummaryText(overview.summary);
                  setEditingOverview(true);
                }}
              >
                <Pencil />
                Edit summary
              </Button>
            )}
          </div>

          {editingOverview ? (
            <div className="flex flex-col gap-3">
              <Field label="Summary" hint="Used to explain your product in every email.">
                <Textarea rows={4} value={summaryText} onChange={(e) => setSummaryText(e.target.value)} autoFocus />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingOverview(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setOverview({ ...overview, summary: summaryText });
                    setEditingOverview(false);
                  }}
                >
                  Save summary
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">{overview.summary}</p>
          )}

          {(overview.valuePropositions ?? []).length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground">Why customers buy</h4>
              <ul className="mt-2 flex flex-col gap-1.5">
                {(overview.valuePropositions ?? []).map((vp, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <Check className="mt-0.5 size-4 shrink-0 text-success-text" aria-hidden />
                    <span>{vp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {overview.targetMarket && (
            <div>
              <h4 className="text-xs text-muted-foreground">Market</h4>
              <p className="mt-1 text-[13px]">{overview.targetMarket}</p>
            </div>
          )}
        </section>

        {/* Who you sell to */}
        <section className="flex flex-col gap-4 p-5" aria-labelledby="strategy-icp">
          <h3 id="strategy-icp" className="text-sm font-semibold">
            Who you sell to
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChipList label="Job titles" items={icp.targetTitles ?? []} />
            <ChipList label="Company size" items={(icp.companySizes ?? []).map((s) => `${s} employees`)} />
          </div>
          {(icp.painPoints ?? []).length > 0 && (
            <div>
              <h4 className="text-xs text-muted-foreground">Problems you solve for them</h4>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13px] marker:text-subtle-foreground">
                {(icp.painPoints ?? []).map((pain, i) => (
                  <li key={i}>{pain}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-subtle-foreground">You choose the industries in the next step.</p>
        </section>

        {/* Pitch */}
        <section className="flex flex-col gap-4 p-5" aria-labelledby="strategy-pitch">
          <div>
            <h3 id="strategy-pitch" className="text-sm font-semibold">
              Pitch
            </h3>
            <p className="mt-1 text-[13px] text-muted-foreground">Pick one angle. Every email in the sequence uses it.</p>
          </div>

          <div role="radiogroup" aria-labelledby="strategy-pitch" className="grid gap-2 sm:grid-cols-3">
            {offers.map((o, idx) => {
              const selected = idx === selectedOfferIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedOfferIndex(idx)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
                    selected ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-foreground" : "border-border-strong",
                    )}
                    aria-hidden
                  >
                    {selected && <span className="size-2 rounded-full bg-foreground" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{o.angle || `Option ${idx + 1}`}</span>
                    {o.title && <span className="mt-0.5 block text-xs text-muted-foreground">{o.title}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {offer && (
            <div className="flex flex-col gap-4">
              <Field label="Value proposition" hint="The one sentence that explains why this is worth a reply.">
                <Textarea rows={3} value={offer.valueProp || ""} onChange={(e) => updateOffer("valueProp", e.target.value)} />
              </Field>
              <Field label="Call to action" hint="Keep it low effort, e.g. a question rather than a meeting request.">
                <Input value={offer.cta || ""} onChange={(e) => updateOffer("cta", e.target.value)} />
              </Field>
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-subtle-foreground">Your changes are saved when you continue.</p>
        <Button onClick={confirm} loading={saving} disabled={editingOverview} className="w-full sm:w-auto">
          Continue to audience
          {!saving && <ArrowRight />}
        </Button>
      </div>
    </Card>
  );
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs text-muted-foreground">{label}</h4>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-[13px] text-subtle-foreground">None suggested</span>
        ) : (
          items.map((t, i) => (
            <Badge key={`${t}-${i}`} variant="neutral">
              {t}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

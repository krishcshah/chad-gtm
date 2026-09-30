"use client";

import { useState } from "react";
import { Check, Edit2, Sparkles, Target, Zap, Shield, ArrowRight, RefreshCw, FileText } from "lucide-react";
import { Button } from "@smartreach/ui";
import type { BusinessOverview, IcpProfile, GtmOffer } from "@/lib/chad-gtm-research";

export function StrategyReviewBoard({
  companyName,
  initialOverview,
  initialIcp,
  initialOffers,
  onConfirm,
}: {
  companyName: string;
  initialOverview: BusinessOverview;
  initialIcp: IcpProfile;
  initialOffers: GtmOffer[];
  onConfirm: (data: {
    businessOverview: BusinessOverview;
    icpProfile: IcpProfile;
    offers: GtmOffer[];
    selectedOfferIndex: number;
  }) => void;
}) {
  const [overview, setOverview] = useState<BusinessOverview>(initialOverview);
  const [icp, setIcp] = useState<IcpProfile>(initialIcp);
  const [offers, setOffers] = useState<GtmOffer[]>(initialOffers);
  const [selectedOfferIndex, setSelectedOfferIndex] = useState(0);

  const [editingOverview, setEditingOverview] = useState(false);
  const [summaryText, setSummaryText] = useState(overview.summary);

  const [activeTab, setActiveTab] = useState(0);

  const handleSaveOverview = () => {
    setOverview({ ...overview, summary: summaryText });
    setEditingOverview(false);
  };

  const handleUpdateOffer = (idx: number, field: "valueProp" | "cta", val: string) => {
    const updated = [...offers];
    updated[idx] = { ...updated[idx], [field]: val };
    setOffers(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3" /> Step 2 of 5
            </span>
            <span className="text-xs text-muted-foreground">Collaborative Strategy Board</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground mt-1">
            Review & Refine GTM Strategy for {companyName}
          </h2>
          <p className="text-xs text-muted-foreground">
            AI synthesized your brand positioning, target personas, and outbound hooks. Tweak anything before matching leads.
          </p>
        </div>

        <Button
          type="button"
          onClick={() =>
            onConfirm({
              businessOverview: overview,
              icpProfile: icp,
              offers,
              selectedOfferIndex,
            })
          }
          className="bg-primary text-primary-foreground font-semibold text-xs shadow-md w-full sm:w-auto h-10"
        >
          Confirm & Match Leads <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Business Overview */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Business Overview</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOverview(!editingOverview)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <Edit2 className="size-3" /> {editingOverview ? "Cancel" : "Edit"}
              </button>
            </div>

            {editingOverview ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveOverview}
                  className="text-xs h-7"
                >
                  Save Summary
                </Button>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {overview.summary}
              </p>
            )}

            <div className="space-y-2 pt-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                Value Propositions
              </span>
              <ul className="space-y-1.5">
                {overview.valuePropositions.map((vp, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-foreground/90">
                    <Check className="size-3 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{vp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg bg-muted/30 border border-border/40 p-2.5 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Target Market: </span>
            {overview.targetMarket}
          </div>
        </div>

        {/* Card 2: Ideal Customer Profile (ICP) */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-foreground">Ideal Customer Profile</h3>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              High Intent
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Target Personas & Titles
              </span>
              <div className="flex flex-wrap gap-1.5">
                {icp.targetTitles.map((title, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Target Company Sizes
              </span>
              <div className="flex flex-wrap gap-1.5">
                {icp.companySizes.map((size, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-muted border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {size} employees
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1.5">
                Primary Pain Points Solved
              </span>
              <ul className="space-y-1.5">
                {icp.painPoints.map((pain, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <span>{pain}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Card 3: Value Offers & Angles */}
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-amber-400" />
                <h3 className="text-sm font-bold text-foreground">Outreach Angles & Hooks</h3>
              </div>
              <span className="text-[10px] font-semibold text-muted-foreground">
                3 Options
              </span>
            </div>

            {/* Offer Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
              {offers.map((offer, idx) => (
                <button
                  key={idx}
                  type="button"
                  title={offer.angle}
                  onClick={() => {
                    setActiveTab(idx);
                    setSelectedOfferIndex(idx);
                  }}
                  className={`rounded-md py-1.5 px-1.5 text-[10px] font-bold transition-all truncate text-center ${
                    activeTab === idx
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {offer.angle}
                </button>
              ))}
            </div>

            {/* Active Offer Content */}
            <div className="space-y-3 pt-1">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
                  Value Pitch Statement
                </span>
                <textarea
                  rows={3}
                  value={offers[activeTab]?.valueProp || ""}
                  onChange={(e) => handleUpdateOffer(activeTab, "valueProp", e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/30 p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-1">
                  Call To Action (Low Friction)
                </span>
                <input
                  type="text"
                  value={offers[activeTab]?.cta || ""}
                  onChange={(e) => handleUpdateOffer(activeTab, "cta", e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 flex items-center justify-between text-xs text-emerald-400">
            <span>Primary Campaign Angle</span>
            <span className="font-bold">{offers[selectedOfferIndex]?.angle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

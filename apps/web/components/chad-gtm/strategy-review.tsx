"use client";

import { useState } from "react";
import { Check, Edit2, Sparkles, Target, Zap, ArrowRight, FileText } from "lucide-react";
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
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300">
              Stage 02 // Strategy
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-500">Collaborative Board</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white mt-1">
            Outbound Strategy: {companyName}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            AI synthesized your brand positioning, target personas, and outbound hooks. Refine parameters before lead matching.
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
          className="rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 h-10 px-5 w-full sm:w-auto shadow-xs transition-all active:scale-[0.98]"
        >
          Confirm & Match Leads <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Business Overview */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-4 flex flex-col justify-between card-shine shadow-xs">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-zinc-300" />
                <h3 className="text-xs font-semibold text-white tracking-tight">Business Overview</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOverview(!editingOverview)}
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 font-medium transition-colors"
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
                  className="w-full rounded-lg border border-zinc-700 bg-black/60 p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white leading-relaxed"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveOverview}
                  className="rounded-md bg-white text-black text-xs font-semibold h-8 px-3"
                >
                  Save Summary
                </Button>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-zinc-400">
                {overview.summary}
              </p>
            )}

            <div className="space-y-2 pt-2 border-t border-zinc-800/60">
              <span className="text-[11px] font-semibold text-zinc-500 block">
                Value Propositions:
              </span>
              <ul className="space-y-1.5">
                {overview.valuePropositions.map((vp, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <Check className="size-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{vp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 p-3 text-xs text-zinc-400">
            <span className="font-semibold text-white">Target Market: </span>
            {overview.targetMarket}
          </div>
        </div>

        {/* Card 2: Ideal Customer Profile (ICP) */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-4 card-shine shadow-xs">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-zinc-300" />
              <h3 className="text-xs font-semibold text-white tracking-tight">Target Persona (ICP)</h3>
            </div>
            <span className="text-[10px] font-semibold text-emerald-400 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5">
              High Intent
            </span>
          </div>

          <div className="space-y-3.5">
            <div>
              <span className="text-[11px] font-semibold text-zinc-500 block mb-1.5">
                Target Job Titles
              </span>
              <div className="flex flex-wrap gap-1.5">
                {icp.targetTitles.map((title, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-zinc-900/70 border border-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-300"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] font-semibold text-zinc-500 block mb-1.5">
                Target Headcounts
              </span>
              <div className="flex flex-wrap gap-1.5">
                {icp.companySizes.map((size, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-zinc-900/70 border border-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-400"
                  >
                    {size} employees
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800/60">
              <span className="text-[11px] font-semibold text-zinc-500 block mb-1.5">
                Primary Pain Points Solved
              </span>
              <ul className="space-y-1.5">
                {icp.painPoints.map((pain, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="size-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>{pain}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Card 3: Value Offers & Angles */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-4 flex flex-col justify-between card-shine shadow-xs">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2.5">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-zinc-300" />
                <h3 className="text-xs font-semibold text-white tracking-tight">Outreach Angles & Hooks</h3>
              </div>
              <span className="text-[11px] text-zinc-500">
                3 Options
              </span>
            </div>

            {/* Offer Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-900/60 p-1 border border-zinc-800/80">
              {offers.map((offer, idx) => (
                <button
                  key={idx}
                  type="button"
                  title={offer.angle}
                  onClick={() => {
                    setActiveTab(idx);
                    setSelectedOfferIndex(idx);
                  }}
                  className={`rounded-md py-1.5 px-1 text-[11px] font-medium transition-all truncate text-center ${
                    activeTab === idx
                      ? "bg-zinc-800 text-white font-semibold shadow-xs"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {offer.angle}
                </button>
              ))}
            </div>

            {/* Active Offer Content */}
            <div className="space-y-3 pt-1">
              <div>
                <span className="text-[11px] font-semibold text-zinc-500 block mb-1">
                  Core Value Proposition Statement
                </span>
                <textarea
                  rows={3}
                  value={offers[activeTab]?.valueProp || ""}
                  onChange={(e) => handleUpdateOffer(activeTab, "valueProp", e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-black/60 p-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white leading-relaxed"
                />
              </div>

              <div>
                <span className="text-[11px] font-semibold text-zinc-500 block mb-1">
                  Call To Action (Low Friction)
                </span>
                <input
                  type="text"
                  value={offers[activeTab]?.cta || ""}
                  onChange={(e) => handleUpdateOffer(activeTab, "cta", e.target.value)}
                  className="w-full rounded-md border border-zinc-800 bg-black/60 px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white"
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/80 px-3 py-2 flex items-center justify-between text-xs text-zinc-300">
            <span className="text-[11px] text-zinc-500">Selected Angle:</span>
            <span className="font-semibold text-white">{offers[selectedOfferIndex]?.angle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

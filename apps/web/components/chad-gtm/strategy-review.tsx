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
    <div className="space-y-6 font-mono">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
              STAGE 02 // STRATEGY
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Collaborative Board</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white mt-1">
            Outbound Strategy: {companyName}
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
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
          className="rounded-none bg-white text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white h-10 px-5 w-full sm:w-auto"
        >
          Confirm & Match Leads <ArrowRight className="size-3.5 ml-1.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1: Business Overview */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-white" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Business Overview</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingOverview(!editingOverview)}
                className="text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white flex items-center gap-1"
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
                  className="w-full rounded-none border border-zinc-700 bg-black p-2.5 text-xs text-white focus:outline-none focus:border-white leading-relaxed font-mono"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveOverview}
                  className="rounded-none bg-white text-black text-[10px] font-mono uppercase tracking-wider h-7 px-3"
                >
                  Save Summary
                </Button>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-zinc-400 font-sans">
                {overview.summary}
              </p>
            )}

            <div className="space-y-2 pt-2 border-t border-zinc-800">
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block">
                Value Propositions:
              </span>
              <ul className="space-y-1.5 font-sans">
                {overview.valuePropositions.map((vp, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <Check className="size-3 text-white mt-0.5 shrink-0" />
                    <span>{vp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-none bg-black border border-zinc-800 p-2.5 text-[10px] uppercase tracking-wider text-zinc-400">
            <span className="font-bold text-white">Target Market: </span>
            {overview.targetMarket}
          </div>
        </div>

        {/* Card 2: Ideal Customer Profile (ICP) */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-white" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Target Persona (ICP)</h3>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-300 border border-zinc-800 bg-black px-1.5 py-0.5">
              High Intent
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1.5">
                Target Job Titles
              </span>
              <div className="flex flex-wrap gap-1">
                {icp.targetTitles.map((title, i) => (
                  <span
                    key={i}
                    className="rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1.5">
                Target Headcounts
              </span>
              <div className="flex flex-wrap gap-1">
                {icp.companySizes.map((size, i) => (
                  <span
                    key={i}
                    className="rounded-none bg-black border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                  >
                    {size} employees
                  </span>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-800">
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1.5">
                Primary Pain Points Solved
              </span>
              <ul className="space-y-1.5 font-sans">
                {icp.painPoints.map((pain, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                    <span className="size-1 rounded-none bg-white mt-1.5 shrink-0" />
                    <span>{pain}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Card 3: Value Offers & Angles */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-white" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Outreach Angles & Hooks</h3>
              </div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest">
                3 Options
              </span>
            </div>

            {/* Offer Tabs */}
            <div className="grid grid-cols-3 gap-1 rounded-none bg-black p-0.5 border border-zinc-800">
              {offers.map((offer, idx) => (
                <button
                  key={idx}
                  type="button"
                  title={offer.angle}
                  onClick={() => {
                    setActiveTab(idx);
                    setSelectedOfferIndex(idx);
                  }}
                  className={`rounded-none py-1.5 px-1 text-[10px] font-bold uppercase tracking-wider transition-colors truncate text-center ${
                    activeTab === idx
                      ? "bg-white text-black font-semibold"
                      : "text-zinc-500 hover:text-white"
                  }`}
                >
                  {offer.angle}
                </button>
              ))}
            </div>

            {/* Active Offer Content */}
            <div className="space-y-3 pt-1">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">
                  Core Value Proposition Statement
                </span>
                <textarea
                  rows={3}
                  value={offers[activeTab]?.valueProp || ""}
                  onChange={(e) => handleUpdateOffer(activeTab, "valueProp", e.target.value)}
                  className="w-full rounded-none border border-zinc-800 bg-black p-2 text-xs text-white focus:outline-none focus:border-white leading-relaxed font-mono"
                />
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 block mb-1">
                  Call To Action (Low Friction)
                </span>
                <input
                  type="text"
                  value={offers[activeTab]?.cta || ""}
                  onChange={(e) => handleUpdateOffer(activeTab, "cta", e.target.value)}
                  className="w-full rounded-none border border-zinc-800 bg-black px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white font-mono"
                />
              </div>
            </div>
          </div>

          <div className="rounded-none bg-black border border-zinc-800 px-3 py-2 flex items-center justify-between text-xs text-zinc-300">
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Selected Angle:</span>
            <span className="font-bold text-white uppercase">{offers[selectedOfferIndex]?.angle}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

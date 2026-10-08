"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Globe,
  ArrowRight,
  Loader2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Search,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { toast } from "sonner";
import {
  analyzeWebsiteAction,
  updateGtmStrategyAction,
  generateCalibrationEmailsAction,
  refineGtmCalibrationAction,
  launchChadGtmCampaignAction,
  type CalibrationProfile,
} from "@/lib/chad-gtm-actions";
import { StrategyReviewBoard } from "@/components/chad-gtm/strategy-review";
import { LeadMatcher } from "@/components/chad-gtm/lead-matcher";
import { SwipeCardDeck, type EmailCalibrationSample } from "@/components/chad-gtm/swipe-card";
import { CalibrationRefinementView } from "@/components/chad-gtm/calibration-refinement-view";
import { VelocitySlider } from "@/components/chad-gtm/velocity-slider";
import type { SynthesizedGtmStrategy } from "@/lib/chad-gtm-research";

export function ChadGtmWizard({
  allIndustries,
}: {
  allIndustries: string[];
}) {
  const router = useRouter();

  // Step state: 1: URL input, 2: Strategy board, 3: Lead matching, 4: Calibration deck, 5: Velocity & launch
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);

  // Analysis HUD
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);

  const TICKER_MESSAGES = [
    "Connecting to company domain...",
    "Crawling homepage and subpages...",
    "Analyzing value propositions and differentiators...",
    "Cross-referencing 100M+ global B2B lead directory...",
    "Synthesizing high-converting cold email hooks...",
  ];

  useEffect(() => {
    if (!isAnalyzing) return;
    const interval = setInterval(() => {
      setTickerIndex((i) => (i + 1) % TICKER_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Strategy & session state
  const [runId, setRunId] = useState<string>("");
  const [strategy, setStrategy] = useState<SynthesizedGtmStrategy | null>(null);
  const [selectedOfferIndex, setSelectedOfferIndex] = useState(0);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [calibrationDeck, setCalibrationDeck] = useState<EmailCalibrationSample[]>([]);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isRefiningCopy, setIsRefiningCopy] = useState(false);
  const [isCalibrationReviewed, setIsCalibrationReviewed] = useState(false);
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile | null>(null);
  const [refinedSamples, setRefinedSamples] = useState<EmailCalibrationSample[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);

  // Step 1: Submit URL & Launch Deep Analysis
  const handleLaunchAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a valid company website URL.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await analyzeWebsiteAction(url.trim(), notes.trim() || undefined);
      if (res.ok && res.runId && res.strategy) {
        setRunId(res.runId);
        setStrategy(res.strategy);
        setSelectedIndustries(res.strategy.icpProfile.industries || []);
        toast.success(`Deep AI analysis complete for ${res.strategy.companyName}!`);
        setStep(2);
      } else {
        toast.error(res.error || "Failed to analyze website.");
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 2: Confirm Strategy Board
  const handleConfirmStrategy = async (data: {
    businessOverview: any;
    icpProfile: any;
    offers: any[];
    selectedOfferIndex: number;
  }) => {
    if (!strategy) return;
    setSelectedOfferIndex(data.selectedOfferIndex);
    const updatedStrategy = {
      ...strategy,
      businessOverview: data.businessOverview,
      icpProfile: data.icpProfile,
      offers: data.offers,
    };
    setStrategy(updatedStrategy);
    await updateGtmStrategyAction(runId, {
      ...data,
      selectedIndustries,
    });
    setStep(3);
  };

  // Step 3: Match Leads & Proceed to Calibration Deck
  const handleProceedFromMatcher = async (industries: string[]) => {
    setSelectedIndustries(industries);
    await updateGtmStrategyAction(runId, {
      businessOverview: strategy?.businessOverview,
      icpProfile: strategy?.icpProfile,
      offers: strategy?.offers || [],
      selectedIndustries: industries,
    });

    setIsCalibrating(true);
    setStep(4);
    try {
      const res = await generateCalibrationEmailsAction(runId, selectedOfferIndex);
      if (res.ok && res.emailSamples) {
        setCalibrationDeck(res.emailSamples);
      } else {
        toast.error("Failed to generate calibration deck. Using default samples.");
      }
    } catch {
      toast.error("Could not fetch calibration samples.");
    } finally {
      setIsCalibrating(false);
    }
  };

  // Step 4: Complete Calibration Deck & Refine Outbound Copy
  const handleCompleteCalibration = async (deck: EmailCalibrationSample[]) => {
    setCalibrationDeck(deck);
    setIsRefiningCopy(true);
    setIsCalibrationReviewed(false);

    try {
      const res = await refineGtmCalibrationAction(runId, deck, selectedOfferIndex);
      if (res.ok && res.profile) {
        setCalibrationProfile(res.profile);
        if (res.refinedSamples && res.refinedSamples.length > 0) {
          setRefinedSamples(res.refinedSamples);
        }
        toast.success("Outreach copy calibrated to your preferences!");
        setIsCalibrationReviewed(true);
      } else {
        toast.error(res.error || "Failed to adjust copy. Using calibrated defaults.");
        setIsCalibrationReviewed(true);
      }
    } catch (err: any) {
      toast.error(err?.message || "An unexpected error occurred while refining copy.");
      setIsCalibrationReviewed(true);
    } finally {
      setIsRefiningCopy(false);
    }
  };

  // Step 5: Launch Campaign
  const handleLaunchCampaign = async (dailyLimit: number) => {
    setIsLaunching(true);
    try {
      const samplesToUse =
        refinedSamples.length > 0
          ? refinedSamples
          : calibrationDeck.filter((c) => c.approved).length > 0
          ? calibrationDeck.filter((c) => c.approved)
          : calibrationDeck.slice(0, 3);

      const res = await launchChadGtmCampaignAction(
        runId,
        dailyLimit,
        samplesToUse,
        selectedOfferIndex
      );

      if (res.ok) {
        toast.success("Autonomous Go-To-Market outreach launched!");
        router.push(`/chad-gtm/${runId}`);
      } else {
        toast.error(res.error || "Failed to launch autonomous campaign.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to launch campaign.");
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl py-4 sm:py-8 space-y-6 sm:space-y-8 font-sans">
      {/* Step Indicator Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl border border-zinc-700/80 bg-zinc-900 flex items-center justify-center text-white shadow-xs">
            <Zap className="size-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              ChadGTM <span className="text-zinc-500 font-normal text-xs">// Autonomous Engine</span>
            </h1>
          </div>
        </div>

        {/* Step Ticker Badges (Mobile) */}
        <div className="flex sm:hidden items-center text-xs">
          <span className="rounded-full bg-zinc-900 border border-zinc-700/80 px-3 py-1 text-xs font-medium text-white">
            Stage {step} of 5: {["URL Scan", "Strategy", "B2B Leads", "Calibration", "Launch"][step - 1]}
          </span>
        </div>

        {/* Stepper Pills (Desktop) */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          {[
            { s: 1, label: "URL Scan" },
            { s: 2, label: "Strategy" },
            { s: 3, label: "B2B Leads" },
            { s: 4, label: "Calibration" },
            { s: 5, label: "Launch" },
          ].map((item) => (
            <div
              key={item.s}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium tracking-tight transition-all ${
                step === item.s
                  ? "bg-white text-black font-semibold shadow-xs"
                  : step > item.s
                  ? "border border-zinc-700/80 bg-zinc-900/80 text-zinc-200"
                  : "border border-zinc-800/80 bg-zinc-950/60 text-zinc-500"
              }`}
            >
              <span className={`flex size-4 items-center justify-center rounded-full text-[10px] ${
                step === item.s ? "bg-black text-white" : step > item.s ? "bg-emerald-500 text-black font-bold" : "bg-zinc-800 text-zinc-400"
              }`}>
                {step > item.s ? "✓" : item.s}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: The Hero Command Bar */}
      {step === 1 && (
        <div className="mx-auto max-w-2xl py-4 sm:py-6 space-y-6">
          <div className="text-center space-y-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 text-xs font-medium text-zinc-300">
              <Sparkles className="size-3 text-emerald-400" /> Autonomous Pipeline Synthesis
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Launch Outbound Engine
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mx-auto leading-relaxed">
              Enter your company website. Our autonomous engine analyzes your product, cross-references 100M+ verified global B2B prospects, and dispatches calibrated outreach through our pre-warmed shared mailbox pool.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLaunchAnalysis} className="space-y-3">
            <div className="relative rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-2 transition-all focus-within:border-zinc-500 card-shine shadow-lg">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-1">
                <div className="flex items-center gap-2.5 flex-1 min-w-0 bg-black/40 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-lg">
                  <Globe className="size-4 text-zinc-500 shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="https://yourcompany.com"
                    value={url}
                    disabled={isAnalyzing}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-transparent py-2 text-xs sm:text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isAnalyzing || !url.trim()}
                  className="h-10 px-5 rounded-lg text-xs font-semibold tracking-tight bg-white hover:bg-zinc-200 text-black shadow-xs shrink-0 w-full sm:w-auto transition-all active:scale-[0.98]"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin mr-1.5" /> Analyzing...
                    </>
                  ) : (
                    <>
                      Launch Analysis <Sparkles className="size-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Optional Context Drawer */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/80 overflow-hidden shadow-xs">
              <button
                type="button"
                onClick={() => setShowNotesDrawer(!showNotesDrawer)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                <span>Additional Context / Specific Angle (Optional)</span>
                {showNotesDrawer ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>

              {showNotesDrawer && (
                <div className="p-3.5 pt-0 border-t border-zinc-800/60">
                  <textarea
                    rows={3}
                    placeholder="e.g. We are offering a free 14-day benchmark trial for Series B SaaS engineering teams..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-black/60 p-3 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white leading-relaxed"
                  />
                </div>
              )}
            </div>
          </form>

          {/* Interactive Scanning HUD */}
          {isAnalyzing && (
            <div className="rounded-xl border border-zinc-700/80 bg-zinc-950/90 p-5 space-y-3.5 card-shine shadow-xl">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl border border-zinc-700 bg-zinc-900 flex items-center justify-center text-white shadow-xs">
                  <Loader2 className="size-4 animate-spin text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Research Pipeline Active
                  </h4>
                  <p className="text-xs sm:text-sm font-semibold text-white tracking-tight mt-0.5">
                    {TICKER_MESSAGES[tickerIndex]}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{
                      width: `${((tickerIndex + 1) / TICKER_MESSAGES.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/80 card-shine shadow-xs">
              <div className="size-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white shrink-0 mt-0.5">
                <Cpu className="size-3.5 text-zinc-300" />
              </div>
              <div>
                <span className="font-semibold text-white block text-xs tracking-tight">Zero SMTP Setup</span>
                <span className="text-zinc-400 text-xs">Pre-warmed pool dispatch.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/80 card-shine shadow-xs">
              <div className="size-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white shrink-0 mt-0.5">
                <Search className="size-3.5 text-zinc-300" />
              </div>
              <div>
                <span className="font-semibold text-white block text-xs tracking-tight">100M+ Global Leads</span>
                <span className="text-zinc-400 text-xs">Instant B2B matching.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/80 card-shine shadow-xs">
              <div className="size-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-white shrink-0 mt-0.5">
                <ShieldCheck className="size-3.5 text-zinc-300" />
              </div>
              <div>
                <span className="font-semibold text-white block text-xs tracking-tight">Voice Calibration</span>
                <span className="text-zinc-400 text-xs">Approval deck calibration.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Collaborative Strategy Board */}
      {step === 2 && strategy && (
        <StrategyReviewBoard
          companyName={strategy.companyName}
          initialOverview={strategy.businessOverview}
          initialIcp={strategy.icpProfile}
          initialOffers={strategy.offers}
          onConfirm={handleConfirmStrategy}
        />
      )}

      {/* STEP 3: Apollo Lead Extraction & Industry Refinement */}
      {step === 3 && (
        <LeadMatcher
          initialIndustries={selectedIndustries}
          allAvailableIndustries={allIndustries}
          onProceed={handleProceedFromMatcher}
        />
      )}

      {/* STEP 4: Tinder-Style Email Calibration Swipe Deck & Refinement */}
      {step === 4 && (
        <>
          {isCalibrating ? (
            <div className="py-16 text-center space-y-4 font-mono">
              <Loader2 className="mx-auto size-7 animate-spin text-white" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Generating Calibration Deck...
                </h3>
                <p className="text-xs text-zinc-500 uppercase tracking-widest mt-1">
                  Synthesizing ~10 hyper-personalized cold outreach angles against matched prospects.
                </p>
              </div>
            </div>
          ) : isRefiningCopy || isCalibrationReviewed ? (
            <CalibrationRefinementView
              isRefining={isRefiningCopy}
              profile={calibrationProfile}
              refinedSamples={
                refinedSamples.length > 0
                  ? refinedSamples
                  : calibrationDeck.filter((c) => c.approved)
              }
              approvedCount={calibrationDeck.filter((c) => c.approved).length}
              rejectedCount={calibrationDeck.filter((c) => !c.approved).length}
              onProceedToLaunch={() => setStep(5)}
              onRecalibrate={() => {
                setIsCalibrationReviewed(false);
                setIsRefiningCopy(false);
              }}
            />
          ) : (
            <SwipeCardDeck
              samples={calibrationDeck}
              onComplete={handleCompleteCalibration}
            />
          )}
        </>
      )}

      {/* STEP 5: Daily Velocity & Spend Slider */}
      {step === 5 && (
        <VelocitySlider
          initialLimit={60}
          onLaunch={handleLaunchCampaign}
          isLaunching={isLaunching}
        />
      )}
    </div>
  );
}

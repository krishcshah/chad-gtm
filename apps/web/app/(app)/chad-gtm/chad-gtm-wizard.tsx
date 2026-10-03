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
    "Cross-referencing Apollo 329k+ B2B lead directory...",
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
    <div className="mx-auto max-w-5xl py-4 sm:py-8 space-y-6 sm:space-y-8 font-mono">
      {/* Step Indicator Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-none border border-white bg-black flex items-center justify-center text-white font-mono font-bold text-sm">
            ⚡
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider text-white flex items-center gap-2">
              ChadGTM <span className="text-zinc-500 font-normal text-xs">// Autonomous Engine</span>
            </h1>
          </div>
        </div>

        {/* Step Ticker Badges (Mobile + Desktop) */}
        <div className="flex sm:hidden items-center text-xs">
          <span className="rounded-none bg-zinc-900 border border-zinc-700 px-2 py-0.5 text-[10px] uppercase font-bold text-white">
            STAGE {step}/5: {["URL Scan", "Strategy", "Apollo Leads", "Calibration", "Launch"][step - 1]}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          {[
            { s: 1, label: "01. URL Scan" },
            { s: 2, label: "02. Strategy" },
            { s: 3, label: "03. Apollo Leads" },
            { s: 4, label: "04. Calibration" },
            { s: 5, label: "05. Launch" },
          ].map((item) => (
            <div
              key={item.s}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-none text-[10px] uppercase tracking-wider border font-mono transition-colors ${
                step === item.s
                  ? "bg-white text-black border-white font-semibold"
                  : step > item.s
                  ? "border-zinc-700 bg-zinc-900 text-zinc-300"
                  : "border-zinc-800 bg-black text-zinc-600"
              }`}
            >
              <span>{item.s < step ? "✓" : item.s}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 1: The Hero Command Bar */}
      {step === 1 && (
        <div className="mx-auto max-w-2xl py-4 sm:py-6 space-y-6">
          <div className="text-center space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-none border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-zinc-400">
              <Sparkles className="size-3" /> Autonomous Pipeline Synthesis
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold uppercase tracking-wider text-white">
              Launch Outbound Engine
            </h2>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto font-sans leading-relaxed">
              Enter your company website. Our autonomous engine analyzes your product, cross-references 329k+ Apollo B2B prospects, and dispatches calibrated outreach through our pre-warmed shared mailbox pool.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLaunchAnalysis} className="space-y-3 font-mono">
            <div className="relative rounded-none border border-zinc-800 bg-zinc-950 p-2 transition-colors focus-within:border-white">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 px-1">
                <div className="flex items-center gap-2 flex-1 min-w-0 bg-black sm:bg-transparent px-3 py-1 sm:p-0">
                  <Globe className="size-4 text-zinc-500 shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="https://yourcompany.com"
                    value={url}
                    disabled={isAnalyzing}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-transparent py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none font-mono"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isAnalyzing || !url.trim()}
                  className="h-10 px-5 rounded-none text-xs font-mono uppercase tracking-wider font-semibold bg-white hover:bg-zinc-200 text-black border border-white shrink-0 w-full sm:w-auto"
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
            <div className="rounded-none border border-zinc-800 bg-zinc-950 overflow-hidden font-mono">
              <button
                type="button"
                onClick={() => setShowNotesDrawer(!showNotesDrawer)}
                className="w-full flex items-center justify-between p-3 text-xs uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
              >
                <span>Additional Context / Specific Angle (Optional)</span>
                {showNotesDrawer ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>

              {showNotesDrawer && (
                <div className="p-3 pt-0 border-t border-zinc-800">
                  <textarea
                    rows={3}
                    placeholder="e.g. We are offering a free 14-day benchmark trial for Series B SaaS engineering teams..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-none border border-zinc-800 bg-black p-2.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white leading-relaxed font-mono"
                  />
                </div>
              )}
            </div>
          </form>

          {/* Interactive Scanning HUD */}
          {isAnalyzing && (
            <div className="rounded-none border border-zinc-700 bg-zinc-950 p-5 space-y-3 font-mono">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-none border border-white bg-black flex items-center justify-center text-white">
                  <Loader2 className="size-4 animate-spin" />
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Research Pipeline Active
                  </h4>
                  <p className="text-xs font-bold text-white uppercase tracking-wider mt-0.5">
                    {TICKER_MESSAGES[tickerIndex]}
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <div className="h-1 w-full bg-zinc-900 border border-zinc-800">
                  <div
                    className="h-full bg-white transition-all duration-300"
                    style={{
                      width: `${((tickerIndex + 1) / TICKER_MESSAGES.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono">
            <div className="flex items-start gap-2.5 p-3 rounded-none border border-zinc-800 bg-zinc-950">
              <Cpu className="size-4 text-white shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block uppercase tracking-wider text-[11px]">Zero SMTP Setup</span>
                <span className="text-zinc-500 font-sans text-xs">Pre-warmed pool dispatch.</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-none border border-zinc-800 bg-zinc-950">
              <Search className="size-4 text-white shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block uppercase tracking-wider text-[11px]">329k Apollo Leads</span>
                <span className="text-zinc-500 font-sans text-xs">Instant B2B matching.</span>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-none border border-zinc-800 bg-zinc-950">
              <ShieldCheck className="size-4 text-white shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white block uppercase tracking-wider text-[11px]">Voice Calibration</span>
                <span className="text-zinc-500 font-sans text-xs">Tinder-style approval deck.</span>
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

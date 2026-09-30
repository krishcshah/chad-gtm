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
  launchChadGtmCampaignAction,
} from "@/lib/chad-gtm-actions";
import { StrategyReviewBoard } from "@/components/chad-gtm/strategy-review";
import { LeadMatcher } from "@/components/chad-gtm/lead-matcher";
import { SwipeCardDeck, type EmailCalibrationSample } from "@/components/chad-gtm/swipe-card";
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

  // Step 4: Complete Calibration Deck
  const handleCompleteCalibration = (approved: EmailCalibrationSample[]) => {
    setCalibrationDeck(approved);
    setStep(5);
  };

  // Step 5: Launch Campaign
  const handleLaunchCampaign = async (dailyLimit: number) => {
    setIsLaunching(true);
    try {
      const res = await launchChadGtmCampaignAction(
        runId,
        dailyLimit,
        calibrationDeck.filter((c) => c.approved).length > 0
          ? calibrationDeck.filter((c) => c.approved)
          : calibrationDeck.slice(0, 3),
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
    <div className="mx-auto max-w-5xl py-4 sm:py-8 space-y-8">
      {/* Step Indicator Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-xl bg-gradient-to-tr from-primary to-emerald-400 flex items-center justify-center text-primary-foreground font-black text-sm shadow-md">
            ⚡
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              ChadGTM <span className="text-xs font-normal text-muted-foreground">• Autonomous Go-To-Market</span>
            </h1>
          </div>
        </div>

        {/* Step Ticker Badges (Mobile + Desktop) */}
        <div className="flex sm:hidden items-center text-xs">
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary">
            Step {step} of 5: {["URL Scan", "Strategy", "Apollo Leads", "Calibration", "Launch"][step - 1]}
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          {[
            { s: 1, label: "URL Scan" },
            { s: 2, label: "Strategy" },
            { s: 3, label: "Apollo Leads" },
            { s: 4, label: "Calibration" },
            { s: 5, label: "Launch" },
          ].map((item) => (
            <div
              key={item.s}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
                step === item.s
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : step > item.s
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "text-muted-foreground/60 bg-muted/30"
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
        <div className="mx-auto max-w-2xl py-6 sm:py-8 space-y-6 sm:space-y-8">
          <div className="text-center space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="size-3.5" /> Self-Driving B2B Cold Outreach
            </span>
            <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              Autonomous Go-To-Market
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Enter your company website. Our autonomous engine analyzes your product, cross-references 329k+ Apollo B2B prospects, and dispatches calibrated outreach through our pre-warmed shared mailbox pool.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLaunchAnalysis} className="space-y-4">
            <div className="relative rounded-2xl border border-border/80 bg-card p-2 sm:p-2.5 shadow-2xl transition-all focus-within:border-primary/80 focus-within:ring-2 focus-within:ring-primary/20">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 px-1 sm:px-2">
                <div className="flex items-center gap-2.5 flex-1 min-w-0 bg-muted/20 sm:bg-transparent rounded-xl px-3 py-1 sm:p-0">
                  <Globe className="size-4.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    required
                    placeholder="https://yourcompany.com"
                    value={url}
                    disabled={isAnalyzing}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-transparent py-2.5 sm:py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={isAnalyzing || !url.trim()}
                  className="h-11 px-5 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-lg w-full sm:w-auto"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-1.5" /> Analyzing...
                    </>
                  ) : (
                    <>
                      Launch Deep AI Analysis <Sparkles className="size-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Optional Context Drawer */}
            <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowNotesDrawer(!showNotesDrawer)}
                className="w-full flex items-center justify-between p-3 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Additional Context / Specific Offer Hook (Optional)</span>
                {showNotesDrawer ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>

              {showNotesDrawer && (
                <div className="p-3 pt-0 border-t border-border/20">
                  <textarea
                    rows={3}
                    placeholder="e.g. We are offering a free 14-day benchmark trial for Series B SaaS engineering teams..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  />
                </div>
              )}
            </div>
          </form>

          {/* Interactive Scanning HUD */}
          {isAnalyzing && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-xl space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
                  <Loader2 className="size-4 animate-spin" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Autonomous Research Pipeline Running
                  </h4>
                  <p className="text-sm font-semibold text-primary">
                    {TICKER_MESSAGES[tickerIndex]}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-500 animate-pulse"
                    style={{
                      width: `${((tickerIndex + 1) / TICKER_MESSAGES.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 text-xs text-muted-foreground">
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/30">
              <Cpu className="size-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">Zero SMTP Setup</span>
                Uses our pre-warmed shared mailbox pool.
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/30">
              <Search className="size-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">329k+ Apollo Leads</span>
                Automatic B2B prospect extraction.
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl border border-border/40 bg-card/30">
              <ShieldCheck className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground block">Tinder Tone Calibration</span>
                Swipe to approve personalized copy.
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

      {/* STEP 4: Tinder-Style Email Calibration Swipe Deck */}
      {step === 4 && (
        <>
          {isCalibrating ? (
            <div className="py-20 text-center space-y-4">
              <Loader2 className="mx-auto size-8 animate-spin text-primary" />
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Generating Tailored Calibration Deck...
                </h3>
                <p className="text-xs text-muted-foreground">
                  Synthesizing ~10 hyper-personalized cold outreach angles against matched prospects.
                </p>
              </div>
            </div>
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

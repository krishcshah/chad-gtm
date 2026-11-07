"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MailX, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  PageHeader,
  StatePanel,
  toast,
} from "@smartreach/ui";
import {
  analyzeWebsiteAction,
  dismissRunAction,
  updateGtmStrategyAction,
  generateCalibrationEmailsAction,
  generateAdaptiveCalibrationSamplesAction,
  refineGtmCalibrationAction,
  launchChadGtmCampaignAction,
  type CalibrationProfile,
} from "@/lib/chad-gtm-actions";
import { StrategyReviewBoard } from "@/components/chad-gtm/strategy-review";
import { LeadMatcher } from "@/components/chad-gtm/lead-matcher";
import { SwipeCardDeck, type EmailCalibrationSample } from "@/components/chad-gtm/swipe-card";
import { CalibrationRefinementView } from "@/components/chad-gtm/calibration-refinement-view";
import { VelocitySlider } from "@/components/chad-gtm/velocity-slider";
import { WorkingPanel } from "@/components/chad-gtm/working-panel";
import { LeadConversationsControl } from "@/components/lead-conversations/lead-conversations-control";
import { LEAD_CONVERSATIONS_LABEL } from "@/lib/lead-conversations";
import { AUTOPILOT_DAILY_DEFAULT, clampAutopilotDaily, withChosenOfferFirst } from "@/lib/autopilot-policy";
import type { SynthesizedGtmStrategy } from "@/lib/chad-gtm-research";
import { WizardStepper } from "./wizard-stepper";
import { WebsiteStep } from "./website-step";

const STEPS = ["Website", "Strategy", "Audience", "Email voice", "Launch"] as const;
type Step = 1 | 2 | 3 | 4 | 5;

/** A saved, unlaunched run to continue where it stopped (#55). */
export interface WizardResume {
  runId: string;
  url: string;
  notes: string;
  strategy: Pick<SynthesizedGtmStrategy, "companyName" | "businessOverview" | "icpProfile" | "offers">;
  selectedIndustries: string[];
  calibrationProfile: CalibrationProfile | Record<string, unknown> | null;
  approvedEmailSamples: EmailCalibrationSample[];
  dailyEmailLimit: number;
  step: 1 | 2 | 4;
}

/**
 * Guided setup: website → strategy → audience → email voice → volume and
 * launch. One decision per step; every step saves before moving on.
 */
export function ChadGtmWizard({ allIndustries, resume }: { allIndustries: string[]; resume?: WizardResume }) {
  const router = useRouter();
  const stepRef = useRef<HTMLDivElement>(null);
  // Reviewed copy is resumed as reviewed: straight on to Launch.
  const resumedReviewed = resume?.step === 4;
  const resumedApproved = resumedReviewed ? (resume?.approvedEmailSamples ?? []).filter((s) => s?.approved !== false) : [];

  const [step, setStep] = useState<Step>(resume?.step ?? 1);
  const [url, setUrl] = useState(resume?.url ?? "");
  const [notes, setNotes] = useState(resume?.notes ?? "");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [runId, setRunId] = useState<string>(resume?.runId ?? "");
  const [strategy, setStrategy] = useState<SynthesizedGtmStrategy | null>(
    resume && resume.step > 1 ? (resume.strategy as SynthesizedGtmStrategy) : null,
  );
  const [selectedOfferIndex, setSelectedOfferIndex] = useState(0);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(resume?.selectedIndustries ?? []);
  const [calibrationDeck, setCalibrationDeck] = useState<EmailCalibrationSample[]>(
    resumedReviewed ? (resume?.approvedEmailSamples ?? []) : [],
  );
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isRefiningCopy, setIsRefiningCopy] = useState(false);
  const [isCalibrationReviewed, setIsCalibrationReviewed] = useState(resumedReviewed);
  const [calibrationProfile, setCalibrationProfile] = useState<CalibrationProfile | null>(
    resumedReviewed ? ((resume?.calibrationProfile as CalibrationProfile | null) ?? null) : null,
  );
  const [refinedSamples, setRefinedSamples] = useState<EmailCalibrationSample[]>(resumedApproved);
  const [isLaunching, setIsLaunching] = useState(false);
  const launchingRef = useRef(false);

  // Delete an unlaunched draft (#55). Nothing was sent.
  const deleteDraft = async () => {
    if (!runId) return;
    const res = await dismissRunAction(runId);
    if (!res.ok) return void toast.error(res.error || "Couldn't delete this draft. Try again.");
    setDeleteOpen(false);
    toast.success("Draft deleted");
    router.push("/chad-gtm");
  };

  // Each step is a new screen: bring it into view and move focus to it.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    stepRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Step 1: research the website.
  const handleLaunchAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      // A run already exists (a resumed draft, or research run again): research it again, never a second run.
      const res = await analyzeWebsiteAction(url.trim(), notes.trim() || undefined, runId ? { existingRunId: runId } : {});
      if (res.ok && res.runId && res.strategy) {
        setRunId(res.runId);
        setStrategy(res.strategy);
        setSelectedIndustries(res.strategy.icpProfile.industries || []);
        toast.success(`Research done for ${res.strategy.companyName}`);
        setStep(2);
      } else {
        toast.error(res.error || "We couldn't analyze that website. Check the address and try again.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Something went wrong while researching your website.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Step 2: save the edited strategy.
  const handleConfirmStrategy = async (data: {
    businessOverview: any;
    icpProfile: any;
    offers: any[];
    selectedOfferIndex: number;
  }) => {
    if (!strategy) return;
    // The chosen offer is saved as offers[0] (#51), so later steps and launch
    // read the same offer from the run at index 0.
    const offers = withChosenOfferFirst(data.offers || [], data.selectedOfferIndex);
    setSelectedOfferIndex(0);
    setStrategy({
      ...strategy,
      businessOverview: data.businessOverview,
      icpProfile: data.icpProfile,
      offers,
    });
    await updateGtmStrategyAction(runId, {
      ...data,
      selectedOfferIndex: data.selectedOfferIndex,
      selectedIndustries,
    });
    setStep(3);
  };

  const generateDeck = async () => {
    setIsCalibrating(true);
    try {
      const res = await generateCalibrationEmailsAction(runId, selectedOfferIndex);
      if (res.ok && res.emailSamples) {
        setCalibrationDeck(res.emailSamples);
      } else {
        toast.error("We couldn't write sample emails. Try again.");
      }
    } catch {
      toast.error("We couldn't write sample emails. Try again.");
    } finally {
      setIsCalibrating(false);
    }
  };

  // Step 3: save industries, then write the sample emails.
  const handleProceedFromMatcher = async (industries: string[], strictRoles = false) => {
    setSelectedIndustries(industries);
    // "Only contact people with these job titles" is stored on the target profile (#57).
    const icpProfile = { ...(strategy?.icpProfile ?? {}), strictRoles } as SynthesizedGtmStrategy["icpProfile"];
    if (strategy) setStrategy({ ...strategy, icpProfile });
    await updateGtmStrategyAction(runId, {
      businessOverview: strategy?.businessOverview,
      icpProfile,
      offers: strategy?.offers || [],
      selectedIndustries: industries,
    });

    setIsCalibrating(true);
    setIsCalibrationReviewed(false);
    setStep(4);
    await generateDeck();
  };

  // Step 4: learn from the reviewed samples and rewrite the copy.
  const handleCompleteCalibration = async (deck: EmailCalibrationSample[]) => {
    setCalibrationDeck(deck);
    setIsRefiningCopy(true);
    setIsCalibrationReviewed(false);
    // Drop any earlier rewrite: if this one fails, launch must use the samples
    // just approved (as the error says), not a stale rewrite of an older deck.
    setCalibrationProfile(null);
    setRefinedSamples([]);

    try {
      const res = await refineGtmCalibrationAction(runId, deck, selectedOfferIndex);
      if (res.ok && res.profile) {
        setCalibrationProfile(res.profile);
        if (res.refinedSamples && res.refinedSamples.length > 0) {
          setRefinedSamples(res.refinedSamples);
        }
        toast.success("Your emails now follow your feedback");
      } else {
        toast.error(res.error || "We couldn't refine the copy. Your approved samples will be used as written.");
      }
    } catch (err: any) {
      toast.error(err?.message || "We couldn't refine the copy. Your approved samples will be used as written.");
    } finally {
      setIsCalibrationReviewed(true);
      setIsRefiningCopy(false);
    }
  };

  // Step 5: launch.
  const handleLaunchCampaign = async (dailyLimit: number) => {
    // One launch at a time: a second click before the first returns is ignored
    // (the server also refuses a concurrent launch of the same run).
    if (isLaunching || launchingRef.current) return;
    launchingRef.current = true;
    setIsLaunching(true);
    try {
      const approved = calibrationDeck.filter((c) => c.approved);
      const samplesToUse =
        refinedSamples.length > 0 ? refinedSamples : approved.length > 0 ? approved : calibrationDeck.slice(0, 3);

      const res = await launchChadGtmCampaignAction(runId, dailyLimit, samplesToUse, selectedOfferIndex);

      if (res.ok) {
        toast.success("Outreach is live");
        router.push(`/chad-gtm/${runId}`);
      } else {
        toast.error(res.error || "We couldn't launch the campaign. Nothing was sent.");
      }
    } catch (err: any) {
      toast.error(err?.message || "We couldn't launch the campaign. Nothing was sent.");
    } finally {
      launchingRef.current = false;
      setIsLaunching(false);
    }
  };

  const approvedCount = calibrationDeck.filter((c) => c.approved).length;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/chad-gtm" className="inline-flex items-center gap-1.5 hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            Autopilot
          </Link>
        }
        title="Guided setup"
        description="Review the strategy, audience and email voice yourself. Nothing is sent until you launch in the last step."
        actions={
          runId && !isLaunching ? (
            <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
              <Trash2 />
              Delete draft
            </Button>
          ) : undefined
        }
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this draft?"
        description="Its research and sample emails are removed. Nothing was sent."
        confirmLabel="Delete draft"
        destructive
        onConfirm={deleteDraft}
      />

      <WizardStepper steps={STEPS} current={step} />

      <div ref={stepRef} tabIndex={-1} role="region" className="flex flex-col gap-6 outline-none" aria-label={`Step ${step}: ${STEPS[step - 1]}`}>
        {step === 1 && (
          <WebsiteStep
            url={url}
            notes={notes}
            onUrlChange={setUrl}
            onNotesChange={setNotes}
            analyzing={isAnalyzing}
            onSubmit={handleLaunchAnalysis}
          />
        )}

        {step === 2 && strategy && (
          <StrategyReviewBoard
            companyName={strategy.companyName}
            initialOverview={strategy.businessOverview}
            initialIcp={strategy.icpProfile}
            initialOffers={strategy.offers}
            initialOfferIndex={selectedOfferIndex}
            onConfirm={handleConfirmStrategy}
          />
        )}

        {step === 3 && (
          <LeadMatcher
            runId={runId}
            initialIndustries={selectedIndustries}
            allAvailableIndustries={allIndustries}
            initialStrictRoles={Boolean((strategy?.icpProfile as { strictRoles?: boolean } | undefined)?.strictRoles)}
            onProceed={handleProceedFromMatcher}
            onBack={() => setStep(2)}
          />
        )}

        {step === 4 &&
          (isCalibrating ? (
            <WorkingPanel
              title="Writing sample emails"
              description="We're drafting about ten emails to real prospects in your audience. Approve the ones that sound like you and reject the rest; we learn from both."
            />
          ) : isRefiningCopy || isCalibrationReviewed ? (
            <CalibrationRefinementView
              isRefining={isRefiningCopy}
              profile={calibrationProfile}
              refinedSamples={refinedSamples.length > 0 ? refinedSamples : calibrationDeck.filter((c) => c.approved)}
              approvedCount={approvedCount}
              rejectedCount={calibrationDeck.length - approvedCount}
              onProceedToLaunch={() => setStep(5)}
              onRecalibrate={() => {
                setIsCalibrationReviewed(false);
                setIsRefiningCopy(false);
              }}
            />
          ) : calibrationDeck.length === 0 ? (
            <Card>
              <StatePanel
                icon={MailX}
                title="No sample emails yet"
                description="We couldn't write the samples this time. Try again; your strategy and audience are saved."
                className="border-0"
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button variant="outline" onClick={() => setStep(3)}>
                      Back to audience
                    </Button>
                    <Button onClick={generateDeck}>Try again</Button>
                  </div>
                }
              />
            </Card>
          ) : (
            <SwipeCardDeck
              samples={calibrationDeck}
              onComplete={handleCompleteCalibration}
              onBack={() => setStep(3)}
              onRequestMore={async (feedback, existingCount) => {
                const res = await generateAdaptiveCalibrationSamplesAction(
                  runId,
                  selectedOfferIndex,
                  feedback,
                  existingCount,
                );
                if (!res.ok || !res.emailSamples) {
                  throw new Error(res.error || "Adaptive generation failed");
                }
                return res.emailSamples as EmailCalibrationSample[];
              }}
            />
          ))}

        {step === 5 && (
          <>
            {runId ? (
              <Card>
                <CardHeader>
                  <CardTitle>{LEAD_CONVERSATIONS_LABEL}</CardTitle>
                  <CardDescription>Who answers when leads reply. You can change it later on the run page.</CardDescription>
                </CardHeader>
                <CardContent>
                  <LeadConversationsControl target={{ runId }} label="Who answers" />
                </CardContent>
              </Card>
            ) : null}
            <VelocitySlider
              initialLimit={resume ? clampAutopilotDaily(resume.dailyEmailLimit) : AUTOPILOT_DAILY_DEFAULT}
              onLaunch={handleLaunchCampaign}
              isLaunching={isLaunching}
              onBack={() => setStep(4)}
              sendingFrom={
                calibrationDeck[0]?.sender && calibrationDeck[0].sender.poolSize > 0
                  ? { poolSize: calibrationDeck[0].sender.poolSize, exampleName: calibrationDeck[0].sender.name }
                  : undefined
              }
            />
          </>
        )}
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Rocket } from "lucide-react";
import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardFooter, toast } from "@smartreach/ui";
import { publishCampaign, saveCampaignDraft, saveCampaignSequence } from "@/lib/actions";
import {
  CAMPAIGN_FIELD_CONTROL_ID,
  firstFailingCampaignField,
  firstFailingCampaignStep,
  isPostalComplianceError,
} from "@/lib/campaign-wizard-errors";
import { normalizeHhMm } from "@/lib/hhmm";
import { blankStep, stepsFromDto, toSavePayload, validateDraft, type DraftStep, type StepSource } from "@/lib/sequence-draft";
import { PRESET_SEQUENCES, parseSequenceTemplate } from "@/lib/sequence-templates";
import { SequenceBuilder } from "./sequence-builder";
import { StepLeads } from "./step-leads";
import { StepName } from "./step-name";
import { StepReview } from "./step-review";
import { StepSchedule } from "./step-schedule";
import { StepSenders } from "./step-senders";
import { WizardStepper } from "./wizard-stepper";
import {
  LAST_STEP,
  WIZARD_STEPS,
  type CampaignDraftSeed,
  type FieldErrors,
  type LeadListOpt,
  type ScheduleSettings,
  type SenderOpt,
  type TemplateOpt,
} from "./wizard-types";
import { bodyHtmlFromText, clampStep, isoToDatetimeLocal, sequenceToDraftSteps } from "./wizard-utils";

export type { CampaignDraftSeed } from "./wizard-types";

/** Fields whose errors belong to each step; used to clear and to flag steps in the stepper. */
const STEP_FIELDS: Record<number, string[]> = {
  1: ["name"],
  2: ["leadListId"],
  3: ["senderIds"],
  4: ["templateId", "sequence", "steps"],
  5: [
    "startMode",
    "scheduledAt",
    "businessDaysOnly",
    "sendingTimezone",
    "sendingWindowStart",
    "sendingWindowEnd",
    "dailyLimit",
    "minDelaySec",
    "maxDelaySec",
    "maxEmailsPerSenderPerDay",
    "stopOnReply",
    "retryFailed",
    "retryCount",
    "postalAddress",
  ],
  6: [],
};

function isWhole(n: number, min: number, max: number) {
  return Number.isInteger(n) && n >= min && n <= max;
}

function initialSettings(d?: CampaignDraftSeed | null): ScheduleSettings {
  return {
    startMode: d?.startMode ?? "now",
    scheduledAt: isoToDatetimeLocal(d?.scheduledAt ?? null),
    businessDaysOnly: d?.businessDaysOnly ?? false,
    sendingTimezone: d?.sendingTimezone ?? "UTC",
    windowStart: d?.sendingWindowStart ?? "09:00",
    windowEnd: d?.sendingWindowEnd ?? "17:00",
    dailyLimit: d?.dailyLimit ?? 500,
    minDelay: d?.minDelaySec ?? 90,
    maxDelay: d?.maxDelaySec ?? 240,
    perSender: d?.maxEmailsPerSenderPerDay ?? 50,
    stopOnReply: d?.stopOnReply ?? true,
    retryFailed: d?.retryFailed ?? true,
    retryCount: d?.retryCount ?? 2,
    trackOpens: d?.trackOpens ?? true,
  };
}

export function CampaignWizard({
  leadLists,
  senders,
  templates,
  initialDraft,
  draftLoadError,
  initialSequenceTemplateId,
  initialLeadListId,
  initialSequence,
}: {
  leadLists: LeadListOpt[];
  senders: SenderOpt[];
  templates: TemplateOpt[];
  initialDraft?: CampaignDraftSeed | null;
  draftLoadError?: string | null;
  /** `?sequence=` / `?sequenceTemplate=`: a preset or saved sequence to start from. */
  initialSequenceTemplateId?: string | null;
  /** `?list=`: lead list to preselect on a new campaign. */
  initialLeadListId?: string | null;
  /** Steps already saved on the draft being resumed. */
  initialSequence?: StepSource[] | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pendingKind, setPendingKind] = useState<"draft" | "publish" | null>(null);

  const [step, setStep] = useState(() => clampStep(initialDraft?.wizardStep));
  const [furthest, setFurthest] = useState(() => clampStep(initialDraft?.wizardStep));
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const focusId = useRef<string[] | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);

  const [name, setName] = useState(initialDraft?.name ?? "");
  const [leadListId, setLeadListId] = useState(
    initialDraft?.leadListId ??
      (initialLeadListId && leadLists.some((l) => l.id === initialLeadListId) ? initialLeadListId : ""),
  );
  const [senderIds, setSenderIds] = useState<Set<string>>(() => new Set(initialDraft?.senderIds ?? []));
  const [templateId, setTemplateId] = useState(initialDraft?.templateId ?? "");
  const [settings, setSettings] = useState<ScheduleSettings>(() => initialSettings(initialDraft));
  const [localTemplates, setLocalTemplates] = useState<TemplateOpt[]>(templates);

  const [seededFrom] = useState<string | null>(() => {
    if (!initialSequenceTemplateId) return null;
    const match =
      PRESET_SEQUENCES.find((p) => p.id === initialSequenceTemplateId) ||
      templates.map((t) => parseSequenceTemplate(t)).find((s) => s.id === initialSequenceTemplateId);
    return match?.name ?? null;
  });

  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (initialSequenceTemplateId) {
      const match =
        PRESET_SEQUENCES.find((p) => p.id === initialSequenceTemplateId) ||
        templates.map((t) => parseSequenceTemplate(t)).find((s) => s.id === initialSequenceTemplateId);
      if (match && match.steps.length > 0) return sequenceToDraftSteps(match);
    }
    if (initialSequence && initialSequence.length > 0) return stepsFromDto(initialSequence);
    const initial = [blankStep(1)];
    if (initialDraft?.templateId) {
      const tpl = templates.find((t) => t.id === initialDraft.templateId);
      if (tpl) {
        initial[0].variants[0].subject = tpl.subject;
        initial[0].variants[0].bodyText = tpl.bodyText;
        initial[0].variants[0].bodyHtml = bodyHtmlFromText(tpl.bodyText);
      }
    }
    return initial;
  });

  const selectedList = leadLists.find((l) => l.id === leadListId);
  const selectedSenders = useMemo(() => senders.filter((s) => senderIds.has(s.id)), [senders, senderIds]);
  const meta = WIZARD_STEPS[step - 1]!;

  const fieldError = (key: string) => fieldErrors[key]?.[0];
  const clearFields = (keys: string[]) =>
    setFieldErrors((prev) => {
      if (!keys.some((k) => prev[k])) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k];
      return next;
    });

  /* ─── Validation ─────────────────────────────────────────────────────── */

  const validateStep = (s: number): FieldErrors => {
    const fe: FieldErrors = {};
    switch (s) {
      case 1:
        if (!name.trim()) fe.name = ["Enter a campaign name."];
        break;
      case 2:
        if (!leadListId) fe.leadListId = ["Choose a lead list."];
        break;
      case 3:
        if (!senders.some((m) => senderIds.has(m.id))) fe.senderIds = ["Choose at least one mailbox."];
        break;
      case 4: {
        const first = steps[0]?.variants[0];
        const draftError = validateDraft(steps);
        if (steps.length === 0 || (!first?.subject.trim() && !templateId)) {
          fe.templateId = ["Add a subject line to the initial email."];
        } else if (draftError) {
          fe.templateId = [draftError];
        }
        break;
      }
      case 5: {
        const v = settings;
        if (v.startMode === "later" && !v.scheduledAt) fe.scheduledAt = ["Pick a start date and time."];
        if (!isWhole(v.dailyLimit, 1, 100_000)) fe.dailyLimit = ["Enter a whole number from 1 to 100,000."];
        if (!isWhole(v.perSender, 1, 5000)) fe.maxEmailsPerSenderPerDay = ["Enter a whole number from 1 to 5,000."];
        if (!isWhole(v.minDelay, 5, 86_400)) fe.minDelaySec = ["Enter a whole number from 5 to 86,400 seconds."];
        if (!isWhole(v.maxDelay, 5, 86_400)) fe.maxDelaySec = ["Enter a whole number from 5 to 86,400 seconds."];
        else if (Number.isFinite(v.minDelay) && v.maxDelay < v.minDelay)
          fe.maxDelaySec = ["Must be at least the shortest gap."];
        if (v.retryFailed && !isWhole(v.retryCount, 0, 10)) fe.retryCount = ["Use a number from 0 to 10."];
        break;
      }
    }
    return fe;
  };

  const stepHasError = (id: number) => STEP_FIELDS[id]!.some((k) => !!fieldErrors[k]?.length);
  const canJumpTo = (id: number) => {
    if (pending) return false;
    if (id < step) return true;
    if (id > furthest) return false;
    for (let k = 1; k < id; k++) if (Object.keys(validateStep(k)).length) return false;
    return true;
  };

  /* ─── Focus management ───────────────────────────────────────────────── */

  const controlIdsFor = (fe: FieldErrors): string[] | null => {
    const field = firstFailingCampaignField(fe);
    if (!field) return null;
    // The sequence step shows its error as an alert (#template-group) or, for a
    // missing first subject, on the subject field; focus whichever is rendered.
    if (field === "templateId" || field === "sequence" || field === "steps") return ["template-group", "step-subject"];
    const id = CAMPAIGN_FIELD_CONTROL_ID[field];
    return id ? [id] : null;
  };

  useEffect(() => {
    const stepChanged = shownStep.current !== step;
    shownStep.current = step;
    const ids = focusId.current;
    if (ids) {
      focusId.current = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          el.focus();
          return;
        }
      }
    }
    // Only move focus to the heading when the step itself changed; clearing a
    // field error while the user types must not pull focus out of the input.
    if (stepChanged && step !== 1) headingRef.current?.focus();
  }, [step, fieldErrors, error]);

  /* ─── Navigation ─────────────────────────────────────────────────────── */

  const goTo = (target: number) => {
    setError(null);
    setStep(target);
    setFurthest((f) => Math.max(f, target));
  };

  const next = () => {
    const fe = validateStep(step);
    if (Object.keys(fe).length) {
      setFieldErrors((prev) => ({ ...prev, ...fe }));
      focusId.current = controlIdsFor(fe);
      return;
    }
    clearFields(STEP_FIELDS[step]!);
    goTo(Math.min(LAST_STEP, step + 1));
  };

  const back = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  /* ─── Persisting ─────────────────────────────────────────────────────── */

  const scheduledIso = () => {
    if (settings.startMode !== "later" || !settings.scheduledAt) return null;
    const d = new Date(settings.scheduledAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };

  const rememberDraft = (id: string) => {
    setDraftId(id);
    const url = new URL(window.location.href);
    if (url.searchParams.get("draft") !== id) {
      url.searchParams.set("draft", id);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    }
  };

  const applyFailure = (message: string, fe: FieldErrors) => {
    setFieldErrors(fe);
    setError(message);
    const jump = firstFailingCampaignStep(fe);
    if (jump) setStep(jump);
    const ids = controlIdsFor(fe);
    focusId.current = ids ?? (isPostalComplianceError(message, fe) ? ["postal-required-alert"] : null);
  };

  const normalizedWindows = () => {
    const sendingWindowStart = normalizeHhMm(settings.windowStart);
    const sendingWindowEnd = normalizeHhMm(settings.windowEnd);
    if (sendingWindowStart !== settings.windowStart || sendingWindowEnd !== settings.windowEnd) {
      setSettings((prev) => ({ ...prev, windowStart: sendingWindowStart, windowEnd: sendingWindowEnd }));
    }
    return { sendingWindowStart, sendingWindowEnd };
  };

  const basePayload = () => {
    const { sendingWindowStart, sendingWindowEnd } = normalizedWindows();
    return {
      name: name.trim(),
      templateId: templateId || null,
      senderIds: [...senderIds],
      startMode: settings.startMode,
      scheduledAt: scheduledIso(),
      businessDaysOnly: settings.businessDaysOnly,
      sendingTimezone: settings.sendingTimezone,
      sendingWindowStart,
      sendingWindowEnd,
      dailyLimit: Number(settings.dailyLimit),
      minDelaySec: Number(settings.minDelay),
      maxDelaySec: Number(settings.maxDelay),
      maxEmailsPerSenderPerDay: Number(settings.perSender),
      stopOnReply: settings.stopOnReply,
      retryFailed: settings.retryFailed,
      // The attempts field is hidden while retry is off; never let a cleared value block saving then.
      retryCount:
        !settings.retryFailed && !Number.isFinite(settings.retryCount) ? 0 : Number(settings.retryCount),
      trackOpens: settings.trackOpens,
    };
  };

  const hasSequence = () => steps.length > 0 && !!steps[0]?.variants[0]?.subject.trim();

  const saveDraft = () => {
    setPendingKind("draft");
    start(async () => {
      try {
        setError(null);
        setFieldErrors({});
        const res = await saveCampaignDraft({
          ...(draftId ? { id: draftId } : {}),
          ...basePayload(),
          leadListId: leadListId || null,
          wizardStep: step,
        });
        if (res.ok && res.data?.id) {
          const cId = res.data.id;
          rememberDraft(cId);
          if (hasSequence()) {
            const seq = await saveCampaignSequence(toSavePayload(cId, steps));
            if (seq && !seq.ok) {
              toast.error("Draft saved, but the emails were not", { description: seq.error });
              return;
            }
          }
          toast.success("Draft saved", { description: "Pick it up any time from Campaigns." });
          return;
        }
        applyFailure(res.ok ? "Could not save the draft." : res.error, res.ok ? {} : (res.fieldErrors ?? {}));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save the draft.");
      } finally {
        setPendingKind(null);
      }
    });
  };

  const submit = () => {
    for (let k = 1; k < LAST_STEP; k++) {
      const fe = validateStep(k);
      if (Object.keys(fe).length) {
        setFieldErrors(fe);
        setStep(k);
        focusId.current = controlIdsFor(fe);
        return;
      }
    }
    setPendingKind("publish");
    start(async () => {
      try {
        setError(null);
        setFieldErrors({});
        const payload: Record<string, unknown> = { ...basePayload(), leadListId };
        if (draftId) payload.id = draftId;
        if (hasSequence()) payload.steps = toSavePayload("", steps).steps;

        const res = await publishCampaign(payload);
        if (res.ok && res.data?.id) {
          router.push(`/campaigns/${res.data.id}`);
          return;
        }
        applyFailure(
          res.ok ? "Could not publish the campaign." : res.error,
          res.ok ? {} : (res.fieldErrors ?? {}),
        );
      } catch (err) {
        console.error("[campaign-wizard] publish failed", err);
        setError(err instanceof Error ? err.message : "Something went wrong while publishing.");
      } finally {
        setPendingKind(null);
      }
    });
  };

  /* ─── Render ─────────────────────────────────────────────────────────── */

  const postal = error ? isPostalComplianceError(error, fieldErrors) : false;
  const description =
    step === LAST_STEP
      ? settings.startMode === "now"
        ? "Check the details below. Nothing is sent until you press Start campaign."
        : "Check the details below. Nothing is sent before the scheduled start."
      : meta.description;

  return (
    <div className="flex flex-col gap-6">
      {draftLoadError && !draftId ? (
        <Alert variant="warning">
          <AlertTitle>That draft could not be opened</AlertTitle>
          <AlertDescription>
            {draftLoadError.replace(/[.\s]+$/, "")}. You can start a new campaign here instead.
          </AlertDescription>
        </Alert>
      ) : null}

      <WizardStepper
        current={step}
        canJumpTo={canJumpTo}
        hasError={stepHasError}
        onJump={(id) => {
          setError(null);
          setStep(id);
        }}
      />

      {seededFrom && step < 4 ? (
        <p className="-mt-2 text-[13px] text-muted-foreground">
          Starting from the “{seededFrom}” sequence. You can change the emails in step 4.
        </p>
      ) : null}

      <Card>
        <div className="flex flex-col gap-1 px-5 pt-5 sm:px-6 sm:pt-6">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-[17px] font-semibold tracking-[-0.01em] text-foreground outline-none"
          >
            {meta.title}
          </h2>
          {description ? <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
        </div>

        <CardContent className="flex flex-col gap-6 sm:p-6">
          {error ? (
            postal ? (
              <Alert
                variant="warning"
                id="postal-required-alert"
                tabIndex={-1}
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link href="/settings">Open settings</Link>
                  </Button>
                }
              >
                <AlertTitle>Add your postal address first</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">{error}</Alert>
            )
          ) : null}

          {step === 1 && (
            <StepName
              name={name}
              error={fieldError("name")}
              onChange={(v) => {
                setName(v);
                clearFields(["name"]);
              }}
              onSubmit={next}
            />
          )}

          {step === 2 && (
            <StepLeads
              leadLists={leadLists}
              leadListId={leadListId}
              error={fieldError("leadListId")}
              onSelect={(id) => {
                setLeadListId(id);
                clearFields(["leadListId"]);
              }}
            />
          )}

          {step === 3 && (
            <StepSenders
              senders={senders}
              senderIds={senderIds}
              error={fieldError("senderIds")}
              onToggle={(id) => {
                setSenderIds((prev) => {
                  const nextSet = new Set(prev);
                  if (nextSet.has(id)) nextSet.delete(id);
                  else nextSet.add(id);
                  return nextSet;
                });
                clearFields(["senderIds"]);
              }}
              onSetAll={(ids) => {
                setSenderIds(new Set(ids));
                clearFields(["senderIds"]);
              }}
            />
          )}

          {step === 4 && (
            <SequenceBuilder
              steps={steps}
              onStepsChange={(nextSteps) => {
                setSteps(nextSteps);
                clearFields(STEP_FIELDS[4]!);
              }}
              templates={localTemplates}
              onTemplateSaved={(tpl) => setLocalTemplates((prev) => [tpl, ...prev])}
              onTemplateApplied={setTemplateId}
              campaignName={name}
              leadListId={leadListId || undefined}
              error={fieldError("templateId") ?? fieldError("sequence") ?? fieldError("steps")}
            />
          )}

          {step === 5 && (
            <StepSchedule
              settings={settings}
              fieldError={fieldError}
              onChange={(patch, clear) => {
                setSettings((prev) => ({ ...prev, ...patch }));
                if (clear?.length) clearFields(clear);
              }}
            />
          )}

          {step === 6 && (
            <StepReview
              name={name}
              list={selectedList}
              senders={selectedSenders}
              steps={steps}
              settings={settings}
              onEdit={(s) => {
                setError(null);
                setStep(s);
              }}
            />
          )}
        </CardContent>

        <CardFooter className="sticky bottom-0 z-10 justify-between gap-2 bg-card px-4 sm:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={saveDraft}
            disabled={pending}
            loading={pendingKind === "draft"}
            className="px-2.5 sm:px-3.5"
          >
            Save as draft
          </Button>
          <div className="flex items-center justify-end gap-2">
            {step > 1 && (
              <Button type="button" variant="outline" onClick={back} disabled={pending} className="max-sm:w-9 max-sm:px-0">
                <ArrowLeft aria-hidden />
                <span className="max-sm:sr-only">Back</span>
              </Button>
            )}
            {step < LAST_STEP ? (
              <Button type="button" onClick={next} disabled={pending}>
                Continue
                <ArrowRight aria-hidden />
              </Button>
            ) : (
              <Button
                type="button"
                variant="brand"
                onClick={submit}
                disabled={pending}
                loading={pendingKind === "publish"}
              >
                {pendingKind !== "publish" && <Rocket aria-hidden className="max-sm:hidden" />}
                {settings.startMode === "now" ? "Start campaign" : "Publish campaign"}
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileText,
  Layers,
  Mail,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { TIMEZONES } from "@smartreach/shared";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  cn,
} from "@smartreach/ui";
import {
  publishCampaign,
  saveCampaignDraft,
  saveCampaignSequence,
  saveSequenceAsTemplate,
} from "@/lib/actions";
import {
  PRESET_SEQUENCES,
  isSequenceTemplate,
  parseSequenceTemplate,
  serializeSequenceTemplate,
  type ReusableSequence,
  type TemplateStepItem,
} from "@/lib/sequence-templates";
import {
  CAMPAIGN_FIELD_CONTROL_ID,
  CAMPAIGN_FIELD_STEP,
  firstFailingCampaignField,
  firstFailingCampaignStep,
} from "@/lib/campaign-wizard-errors";
import { normalizeHhMm } from "@/lib/hhmm";
import {
  MAX_SEQUENCE_STEP_COUNT,
  addStep,
  addVariant,
  blankStep,
  clampDelayDays,
  moveStep,
  plainFromHtml,
  removeStep,
  removeVariant,
  toSavePayload,
  type DraftStep,
  type DraftVariant,
} from "@/lib/sequence-draft";

interface LeadListOpt {
  id: string;
  name: string;
  leadCount: number;
}
interface SenderOpt {
  id: string;
  senderName: string;
  email: string;
  status: string;
  dailyLimit: number;
  usedToday: number;
}
interface TemplateOpt {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
}

const STEPS = [
  { id: 1, label: "Name" },
  { id: 2, label: "Leads" },
  { id: 3, label: "Senders" },
  { id: 4, label: "Sequence" },
  { id: 5, label: "Schedule & Settings" },
  { id: 6, label: "Preview" },
];

const INVALID = "border-destructive ring-2 ring-destructive/40";
const PRIMARY_VARS = ["first_name", "last_name", "company", "email"] as const;

const SAMPLE_LEAD: Record<string, string> = {
  first_name: "Jordan",
  last_name: "Lee",
  company: "Northwind",
  email: "jordan@northwind.example",
  website: "northwind.example",
  job_title: "Head of Growth",
};

export interface CampaignDraftSeed {
  id: string;
  name: string;
  leadListId: string | null;
  templateId: string | null;
  senderIds: string[];
  wizardStep: number | null;
  scheduledAt: string | null;
  businessDaysOnly: boolean;
  sendingTimezone: string;
  sendingWindowStart: string;
  sendingWindowEnd: string;
  dailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  maxEmailsPerSenderPerDay: number;
  stopOnReply: boolean;
  retryFailed: boolean;
  retryCount: number;
  startMode: "now" | "later";
}

function clampStep(step: number | null | undefined) {
  if (!step || step < 1) return 1;
  return Math.min(6, step);
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderWithSampleLead(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|[^}]+)?\}\}/g, (match, key) => {
    return SAMPLE_LEAD[key] || match;
  });
}

export function CampaignWizard({
  leadLists,
  senders,
  templates,
  initialDraft,
  draftLoadError,
  initialSequenceTemplateId,
}: {
  leadLists: LeadListOpt[];
  senders: SenderOpt[];
  templates: TemplateOpt[];
  initialDraft?: CampaignDraftSeed | null;
  draftLoadError?: string | null;
  initialSequenceTemplateId?: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pendingKind, setPendingKind] = useState<"draft" | "publish" | null>(null);
  const [step, setStep] = useState(() => clampStep(initialDraft?.wizardStep));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stepHint, setStepHint] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const focusId = useRef<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [localTemplates, setLocalTemplates] = useState<TemplateOpt[]>(templates);

  const userSequenceTemplates = useMemo(() => {
    return localTemplates
      .map((t) => parseSequenceTemplate(t))
      .filter((s): s is ReusableSequence => s !== null);
  }, [localTemplates]);

  const singleTemplates = useMemo(() => {
    return localTemplates.filter((t) => !isSequenceTemplate(t.bodyText));
  }, [localTemplates]);

  const sequenceToDraftSteps = (seq: ReusableSequence): DraftStep[] => {
    return seq.steps.map((st, idx) => ({
      key: `step-${Date.now()}-${idx}`,
      delayDays: idx === 0 ? 0 : (st.delayDays ?? 3),
      type: idx === 0 ? "initial" : "follow_up",
      variants:
        st.variants && st.variants.length > 0
          ? st.variants.map((v, vi) => ({
              key: `var-${Date.now()}-${idx}-${vi}`,
              label: (vi === 0 ? "A" : "B") as "A" | "B",
              subject: v.subject || "",
              bodyText: v.bodyText || "",
              bodyHtml: v.bodyHtml || (v.bodyText ? `<p>${v.bodyText.replace(/\n/g, "<br>")}</p>` : ""),
              weight: 50,
              pausedAt: null,
              plainEdited: false,
            }))
          : [
              {
                key: `var-${Date.now()}-${idx}-0`,
                label: "A" as const,
                subject: "",
                bodyText: "",
                bodyHtml: "",
                weight: 50,
                pausedAt: null,
                plainEdited: false,
              },
            ],
    }));
  };

  // Form state
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [leadListId, setLeadListId] = useState(initialDraft?.leadListId ?? "");
  const [senderIds, setSenderIds] = useState<Set<string>>(() => new Set(initialDraft?.senderIds ?? []));
  const [templateId, setTemplateId] = useState(initialDraft?.templateId ?? "");
  const [startMode, setStartMode] = useState<"now" | "later">(initialDraft?.startMode ?? "now");
  const [scheduledAt, setScheduledAt] = useState(isoToDatetimeLocal(initialDraft?.scheduledAt ?? null));
  const [businessDaysOnly, setBusinessDaysOnly] = useState(initialDraft?.businessDaysOnly ?? false);
  const [sendingTimezone, setSendingTimezone] = useState(initialDraft?.sendingTimezone ?? "UTC");
  const [windowStart, setWindowStart] = useState(initialDraft?.sendingWindowStart ?? "09:00");
  const [windowEnd, setWindowEnd] = useState(initialDraft?.sendingWindowEnd ?? "17:00");
  const [dailyLimit, setDailyLimit] = useState(initialDraft?.dailyLimit ?? 500);
  const [minDelay, setMinDelay] = useState(initialDraft?.minDelaySec ?? 90);
  const [maxDelay, setMaxDelay] = useState(initialDraft?.maxDelaySec ?? 240);
  const [perSender, setPerSender] = useState(initialDraft?.maxEmailsPerSenderPerDay ?? 50);
  const [stopOnReply, setStopOnReply] = useState(initialDraft?.stopOnReply ?? true);
  const [retryFailed, setRetryFailed] = useState(initialDraft?.retryFailed ?? true);
  const [retryCount, setRetryCount] = useState(initialDraft?.retryCount ?? 2);

  // Sequence state
  const [steps, setSteps] = useState<DraftStep[]>(() => {
    if (initialSequenceTemplateId) {
      const match =
        PRESET_SEQUENCES.find((p) => p.id === initialSequenceTemplateId) ||
        templates.map((t) => parseSequenceTemplate(t)).find((s) => s?.id === initialSequenceTemplateId);
      if (match) {
        return sequenceToDraftSteps(match);
      }
    }
    const initial = [blankStep(1)];
    if (initialDraft?.templateId) {
      const tpl = templates.find((t) => t.id === initialDraft.templateId);
      if (tpl) {
        initial[0].variants[0].subject = tpl.subject;
        initial[0].variants[0].bodyText = tpl.bodyText;
        initial[0].variants[0].bodyHtml = `<p>${tpl.bodyText.replace(/\n/g, "<br>")}</p>`;
      }
    }
    return initial;
  });

  const [saveSeqOpen, setSaveSeqOpen] = useState(false);
  const [saveSeqName, setSaveSeqName] = useState("");
  const [saveSeqDesc, setSaveSeqDesc] = useState("");
  const [saveSeqPending, setSaveSeqPending] = useState(false);
  const [importSeqOpen, setImportSeqOpen] = useState(false);

  const applySavedSequence = (seq: ReusableSequence) => {
    if (!seq.steps || seq.steps.length === 0) return;
    const newSteps = sequenceToDraftSteps(seq);
    setSteps(newSteps);
    setSelectedStep(0);
    setVariantIndex(0);
    setNotice(`Imported sequence "${seq.name}" with ${newSteps.length} steps.`);
    setImportSeqOpen(false);
  };

  const handleSaveSequenceAsTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveSeqName.trim()) return;
    setSaveSeqPending(true);
    try {
      const templateSteps: TemplateStepItem[] = steps.map((s) => ({
        delayDays: s.delayDays,
        variants: s.variants.map((v) => ({
          label: v.label,
          subject: v.subject,
          bodyText: v.bodyText,
          bodyHtml: v.bodyHtml,
        })),
      }));
      const res = await saveSequenceAsTemplate(saveSeqName, saveSeqDesc, templateSteps);
      if (res.ok && res.data) {
        const newTpl: TemplateOpt = {
          id: res.data.id,
          name: saveSeqName.trim(),
          subject: steps[0]?.variants[0]?.subject || saveSeqName.trim(),
          bodyText: serializeSequenceTemplate(saveSeqName.trim(), saveSeqDesc.trim(), templateSteps),
        };
        setLocalTemplates((prev) => [newTpl, ...prev]);
        setSaveSeqOpen(false);
        setNotice(`Sequence "${saveSeqName.trim()}" saved to templates!`);
      } else {
        setError(!res.ok ? res.error : "Failed to save sequence template");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save sequence template");
    } finally {
      setSaveSeqPending(false);
    }
  };
  const [selectedStep, setSelectedStep] = useState(0);
  const [variantIndex, setVariantIndex] = useState(0);
  const [bodyMode, setBodyMode] = useState<"formatted" | "plain">("formatted");
  const [liveSampleLead, setLiveSampleLead] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const activeStep = steps[selectedStep] ?? steps[0];
  const activeVariant =
    activeStep?.variants[Math.min(variantIndex, (activeStep?.variants.length ?? 1) - 1)] ??
    activeStep?.variants[0];
  const actualVariantIndex = activeStep ? Math.min(variantIndex, activeStep.variants.length - 1) : 0;

  const toggleSender = (id: string) =>
    setSenderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedList = leadLists.find((l) => l.id === leadListId);
  const listLeadCount = selectedList?.leadCount ?? 0;

  const fieldMessage = (key: string) => fieldErrors[key]?.[0];
  const clearField = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  useEffect(() => {
    const id = focusId.current;
    if (!id) return;
    focusId.current = null;
    document.getElementById(id)?.focus();
  }, [step, fieldErrors, error]);

  const patchStep = (index: number, patch: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const patchVariant = (stepIdx: number, varIdx: number, patch: Partial<DraftVariant>) => {
    setSteps((prev) =>
      prev.map((item, i) => {
        if (i !== stepIdx) return item;
        return {
          ...item,
          variants: item.variants.map((v, vi) => (vi === varIdx ? { ...v, ...patch } : v)),
        };
      }),
    );
  };

  const applyTemplateToActiveStep = (tplId: string) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setTemplateId(tplId);
    patchVariant(selectedStep, actualVariantIndex, {
      subject: tpl.subject,
      bodyText: tpl.bodyText,
      bodyHtml: `<p>${tpl.bodyText.replace(/\n/g, "<br>")}</p>`,
    });
  };

  const insertVariable = (token: string) => {
    if (!activeVariant) return;
    const isSubjectFocused = document.activeElement === subjectRef.current;
    if (isSubjectFocused && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? activeVariant.subject.length;
      const end = el.selectionEnd ?? activeVariant.subject.length;
      const next = activeVariant.subject.slice(0, start) + token + activeVariant.subject.slice(end);
      patchVariant(selectedStep, actualVariantIndex, { subject: next });
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      return;
    }

    const el = textRef.current;
    const textVal = activeVariant.bodyText || "";
    const start = el?.selectionStart ?? textVal.length;
    const end = el?.selectionEnd ?? textVal.length;
    const next = textVal.slice(0, start) + token + textVal.slice(end);
    patchVariant(selectedStep, actualVariantIndex, {
      bodyText: next,
      bodyHtml: `<p>${next.replace(/\n/g, "<br>")}</p>`,
    });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const stepValid = (s: number): boolean => {
    switch (s) {
      case 1:
        return name.trim().length > 0;
      case 2:
        return !!leadListId;
      case 3:
        return senderIds.size > 0;
      case 4:
        return (
          steps.length > 0 &&
          (steps[0]?.variants[0]?.subject.trim().length > 0 ||
            steps[0]?.variants[0]?.bodyText.trim().length > 0 ||
            !!templateId)
        );
      case 5:
        return (startMode === "now" || !!scheduledAt) && maxDelay >= minDelay;
      case 6:
        return true;
      default:
        return true;
    }
  };

  const STEP_HINT: Record<number, string> = {
    1: "Enter a campaign name to continue.",
    2: "Select a lead list to continue.",
    3: "Select at least one sender account.",
    4: "Write a subject or body for your initial sequence step.",
    5: "Max delay must be ≥ min delay, and pick a start time if scheduled.",
    6: "",
  };

  const progressPct = Math.round(((step - 1) / (STEPS.length - 1)) * 100);
  const stepHasError = (id: number) =>
    Object.keys(fieldErrors).some((key) => !!fieldErrors[key]?.length && CAMPAIGN_FIELD_STEP[key] === id);

  const next = () => {
    setError(null);
    setNotice(null);
    setFieldErrors({});
    if (!stepValid(step)) {
      setStepHint(STEP_HINT[step] ?? "Complete this step to continue.");
      return;
    }
    setStepHint(null);
    setStep((s) => Math.min(6, s + 1));
  };

  const back = () => {
    setError(null);
    setNotice(null);
    setStepHint(null);
    setFieldErrors({});
    setStep((s) => Math.max(1, s - 1));
  };

  const scheduledIso = () => {
    if (startMode !== "later" || !scheduledAt) return null;
    const d = new Date(scheduledAt);
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

  const applyFailure = (message: string, fe: Record<string, string[]>) => {
    setNotice(null);
    setFieldErrors(fe);
    setError(message);
    const jump = firstFailingCampaignStep(fe);
    if (jump) setStep(jump);
    const field = firstFailingCampaignField(fe);
    focusId.current = field ? (CAMPAIGN_FIELD_CONTROL_ID[field] ?? null) : null;
  };

  const normalizedWindows = () => {
    const sendingWindowStart = normalizeHhMm(windowStart);
    const sendingWindowEnd = normalizeHhMm(windowEnd);
    if (sendingWindowStart !== windowStart) setWindowStart(sendingWindowStart);
    if (sendingWindowEnd !== windowEnd) setWindowEnd(sendingWindowEnd);
    return { sendingWindowStart, sendingWindowEnd };
  };

  const saveDraft = () => {
    setPendingKind("draft");
    start(async () => {
      try {
        setError(null);
        setStepHint(null);
        setNotice(null);
        setFieldErrors({});
        const { sendingWindowStart, sendingWindowEnd } = normalizedWindows();
        const res = await saveCampaignDraft({
          ...(draftId ? { id: draftId } : {}),
          name: name.trim(),
          leadListId: leadListId || null,
          templateId: templateId || null,
          senderIds: [...senderIds],
          startMode,
          scheduledAt: scheduledIso(),
          businessDaysOnly,
          sendingTimezone,
          sendingWindowStart,
          sendingWindowEnd,
          dailyLimit: Number(dailyLimit),
          minDelaySec: Number(minDelay),
          maxDelaySec: Number(maxDelay),
          maxEmailsPerSenderPerDay: Number(perSender),
          stopOnReply,
          retryFailed,
          retryCount: Number(retryCount),
          wizardStep: step,
        });
        if (res.ok && res.data?.id) {
          const cId = res.data.id;
          rememberDraft(cId);
          if (steps.length > 0 && steps[0]?.variants[0]?.subject.trim()) {
            await saveCampaignSequence(toSavePayload(cId, steps));
          }
          setNotice("Draft saved. Resume it anytime from Campaigns.");
          return;
        }
        applyFailure(res.ok ? "Could not save draft" : res.error, res.ok ? {} : (res.fieldErrors ?? {}));
      } finally {
        setPendingKind(null);
      }
    });
  };

  const submit = () => {
    setPendingKind("publish");
    start(async () => {
      try {
        setError(null);
        setStepHint(null);
        setNotice(null);
        setFieldErrors({});
        const { sendingWindowStart, sendingWindowEnd } = normalizedWindows();

        const payload: Record<string, unknown> = {
          name: name.trim(),
          leadListId,
          senderIds: [...senderIds],
          templateId: templateId || null,
          startMode,
          scheduledAt: scheduledIso(),
          businessDaysOnly,
          sendingTimezone,
          sendingWindowStart,
          sendingWindowEnd,
          dailyLimit: Number(dailyLimit),
          minDelaySec: Number(minDelay),
          maxDelaySec: Number(maxDelay),
          maxEmailsPerSenderPerDay: Number(perSender),
          stopOnReply,
          retryFailed,
          retryCount: Number(retryCount),
        };

        if (draftId) {
          payload.id = draftId;
        }

        if (steps.length > 0 && steps[0]?.variants[0]?.subject.trim()) {
          payload.steps = toSavePayload("", steps).steps;
        }

        const res = await publishCampaign(payload);
        if (res.ok && res.data?.id) {
          router.push(`/campaigns/${res.data.id}`);
          return;
        }
        applyFailure(res.ok ? "Could not publish campaign" : res.error, res.ok ? {} : (res.fieldErrors ?? {}));
      } catch (err) {
        console.error("[submit] Unexpected error:", err);
        setError(err instanceof Error ? err.message : "Something went wrong while publishing");
      } finally {
        setPendingKind(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Wizard Step Progress Tracker */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Step {step} of {STEPS.length}
            <span className="hidden sm:inline"> · {STEPS[step - 1]?.label}</span>
          </span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-1.5" aria-label={`Campaign wizard ${progressPct}% complete`} />
        <ol className="flex flex-wrap items-center gap-y-2" aria-label="Campaign wizard steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  if (s.id < step) {
                    setStepHint(null);
                    setError(null);
                    setNotice(null);
                    setFieldErrors({});
                    setStep(s.id);
                  }
                }}
                disabled={s.id > step}
                aria-current={s.id === step ? "step" : undefined}
                aria-invalid={stepHasError(s.id) || undefined}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  s.id === step
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : s.id < step
                      ? "bg-success/20 text-success-foreground hover:bg-success/30"
                      : "bg-muted text-muted-foreground",
                  s.id > step && "cursor-not-allowed opacity-60",
                  stepHasError(s.id) && "ring-2 ring-destructive/60",
                )}
              >
                {s.id < step ? <Check className="size-3.5" aria-hidden /> : s.id}
              </button>
              <span
                className={cn(
                  "hidden text-xs sm:inline",
                  s.id === step ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="mx-1.5 hidden h-px w-4 bg-border sm:mx-2 sm:inline-block sm:w-6" aria-hidden />
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        {/* Step 1: Name */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Name your campaign</h2>
              <p className="text-sm text-muted-foreground">Something you&apos;ll recognize at a glance.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-name">Campaign name</Label>
              <Input
                id="c-name"
                autoFocus
                value={name}
                aria-invalid={!!fieldMessage("name")}
                aria-describedby={fieldMessage("name") ? "err-name" : undefined}
                className={fieldMessage("name") ? INVALID : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  clearField("name");
                }}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="e.g. Q1 SaaS founders — US"
              />
              {fieldMessage("name") ? (
                <p id="err-name" className="text-sm text-destructive">
                  {fieldMessage("name")}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {/* Step 2: Leads */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose a lead list</h2>
              <p className="text-sm text-muted-foreground">Select an existing list. Pending leads from it will be queued.</p>
            </div>
            {leadLists.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No lead lists yet"
                description="Create a lead list first, then return here to select it."
                className="py-10"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/leads">Go to lead lists</Link>
                  </Button>
                }
              />
            ) : (
              <div
                id="lead-list-group"
                tabIndex={-1}
                role="group"
                aria-label="Lead lists"
                aria-invalid={!!fieldMessage("leadListId") || undefined}
                aria-describedby={fieldMessage("leadListId") ? "err-leadListId" : undefined}
                className={cn(
                  "space-y-2 rounded-lg outline-none",
                  fieldMessage("leadListId") && "ring-2 ring-destructive/40",
                )}
              >
                {leadLists.map((l) => {
                  const selected = leadListId === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setLeadListId(l.id);
                        clearField("leadListId");
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg p-4 text-left transition-colors",
                        selected
                          ? "border-2 border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border hover:bg-accent/50",
                        fieldMessage("leadListId") && !selected && "border-destructive",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        {selected ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : null}
                        <span className="truncate">{l.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{l.leadCount} leads</span>
                    </button>
                  );
                })}
                {fieldMessage("leadListId") ? (
                  <p id="err-leadListId" className="text-sm text-destructive">
                    {fieldMessage("leadListId")}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Senders */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose sender accounts</h2>
              <p className="text-sm text-muted-foreground">
                The engine rotates across these, respecting each inbox&apos;s daily limit.
              </p>
            </div>
            {senders.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No sender accounts"
                description="Connect at least one mailbox before you can send."
                className="py-10"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/senders/new">Add sender</Link>
                  </Button>
                }
              />
            ) : (
              <div
                id="sender-group"
                tabIndex={-1}
                role="group"
                aria-label="Sender accounts"
                aria-invalid={!!fieldMessage("senderIds") || undefined}
                aria-describedby={fieldMessage("senderIds") ? "err-senderIds" : undefined}
                className={cn(
                  "space-y-2 rounded-lg outline-none",
                  fieldMessage("senderIds") && "ring-2 ring-destructive/40",
                )}
              >
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={senders.length > 0 && senderIds.size === senders.length}
                      onChange={(e) => {
                        setSenderIds(e.target.checked ? new Set(senders.map((s) => s.id)) : new Set());
                        clearField("senderIds");
                      }}
                    />
                    Select all
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {senderIds.size}/{senders.length} selected
                  </span>
                </div>
                {senders.map((s) => (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
                      senderIds.has(s.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={senderIds.has(s.id)}
                      onChange={() => {
                        toggleSender(s.id);
                        clearField("senderIds");
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.senderName} <span className="font-normal text-muted-foreground">· {s.email}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.usedToday}/{s.dailyLimit} used today · {s.status}
                      </p>
                    </div>
                  </label>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">{senderIds.size} selected</p>
                {fieldMessage("senderIds") ? (
                  <p id="err-senderIds" className="text-sm text-destructive">
                    {fieldMessage("senderIds")}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Sequence (Sequence-First & Simplified Composer) */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Sequence</h2>
                <p className="text-sm text-muted-foreground">
                  Configure the sequence of emails. Step 1 is always initial; subsequent steps are follow-ups.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Popover open={importSeqOpen} onOpenChange={setImportSeqOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5 font-medium shadow-2xs">
                      <Layers className="size-3.5 text-primary" /> Import Saved Sequence
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 p-3 sm:w-96">
                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Import Reusable Sequence</p>
                        <p className="text-[11px] text-muted-foreground">
                          Replace sequence with a pre-configured multi-step template.
                        </p>
                      </div>

                      {userSequenceTemplates.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Your Saved Sequences
                          </p>
                          <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                            {userSequenceTemplates.map((seq) => (
                              <button
                                key={seq.id}
                                type="button"
                                onClick={() => applySavedSequence(seq)}
                                className="flex w-full items-start justify-between gap-2 rounded-lg border border-border/60 bg-card p-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent/50"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-foreground">{seq.name}</span>
                                  <p className="line-clamp-1 text-[11px] text-muted-foreground">{seq.description}</p>
                                </div>
                                <Badge variant="secondary" className="shrink-0 text-[10px]">
                                  {seq.stepsCount} steps
                                </Badge>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Battle-Tested Presets
                        </p>
                        <div className="space-y-1.5">
                          {PRESET_SEQUENCES.map((seq) => (
                            <button
                              key={seq.id}
                              type="button"
                              onClick={() => applySavedSequence(seq)}
                              className="flex w-full items-start justify-between gap-2 rounded-lg border border-border/60 bg-card p-2 text-left text-xs transition-colors hover:border-primary/50 hover:bg-accent/50"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <Sparkles className="size-3 text-primary" />
                                  <span className="font-medium text-foreground">{seq.name}</span>
                                </div>
                                <p className="line-clamp-1 text-[11px] text-muted-foreground">{seq.description}</p>
                              </div>
                              <Badge variant="outline" className="shrink-0 text-[10px]">
                                {seq.stepsCount} steps
                              </Badge>
                            </button>
                          ))}
                        </div>
                      </div>

                      {singleTemplates.length > 0 && (
                        <div className="border-t border-border pt-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Single Step Templates
                          </p>
                          <div className="max-h-24 space-y-1 overflow-y-auto pr-1">
                            {singleTemplates.map((tpl) => (
                              <button
                                key={tpl.id}
                                type="button"
                                onClick={() => {
                                  applyTemplateToActiveStep(tpl.id);
                                  setImportSeqOpen(false);
                                }}
                                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent"
                              >
                                <span className="truncate font-medium text-foreground">{tpl.name}</span>
                                <span className="text-[10px] text-muted-foreground">Insert step</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSaveSeqName(name ? `${name} Sequence` : "My Sequence Template");
                    setSaveSeqDesc(`${steps.length}-step cold email sequence`);
                    setSaveSeqOpen(true);
                  }}
                >
                  <BookmarkPlus className="size-3.5" /> Save as Template
                </Button>
              </div>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
              {/* Left Sidebar: Steps & Delays & A/B Variants */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">Steps ({steps.length}/{MAX_SEQUENCE_STEP_COUNT})</h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={steps.length >= MAX_SEQUENCE_STEP_COUNT}
                    onClick={() => {
                      const res = addStep(steps);
                      if (!res.error) {
                        setSteps(res.steps);
                        setSelectedStep(res.steps.length - 1);
                        setVariantIndex(0);
                      }
                    }}
                  >
                    <Plus className="size-3.5" /> Add step
                  </Button>
                </div>

                <ol aria-label="Sequence steps" className="space-y-2">
                  {steps.map((item, index) => {
                    const current = index === selectedStep;
                    const subject = item.variants[0]?.subject?.trim() || "No subject";
                    return (
                      <li key={item.key}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-current={current ? "step" : undefined}
                          onClick={() => {
                            setSelectedStep(index);
                            setVariantIndex(0);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedStep(index);
                              setVariantIndex(0);
                            }
                          }}
                          className={cn(
                            "flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border p-3 text-left text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            current
                              ? "border-primary/40 bg-accent text-accent-foreground shadow-xs"
                              : "border-border bg-card hover:bg-accent/40",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {index === 0 ? "Initial" : `Follow-up ${index}`}
                            </span>
                            <span className="text-[11px] font-medium text-muted-foreground">Step {index + 1}</span>
                          </div>

                          {index === 0 ? (
                            <span className="text-xs text-muted-foreground">Sends immediately</span>
                          ) : (
                            <div
                              className="flex items-center gap-1.5 text-xs text-muted-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>Wait</span>
                              <input
                                type="number"
                                min={0}
                                max={365}
                                aria-label={`Step ${index + 1} wait days`}
                                value={item.delayDays}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  patchStep(index, {
                                    delayDays: clampDelayDays(Number.isNaN(val) ? 0 : val),
                                  });
                                }}
                                className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-center font-mono text-xs text-foreground focus:ring-1 focus:ring-primary"
                              />
                              <span>days</span>
                            </div>
                          )}

                          <span className="truncate text-xs font-medium text-foreground/90">{subject}</span>

                          {/* A/B Variant controls inside left sidebar */}
                          <div
                            className="mt-1 flex items-center justify-between gap-1 border-t border-border/40 pt-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-1">
                              {item.variants.map((v, vi) => (
                                <button
                                  key={v.key}
                                  type="button"
                                  onClick={() => {
                                    setSelectedStep(index);
                                    setVariantIndex(vi);
                                  }}
                                  className={cn(
                                    "h-5 rounded px-2 text-[10px] font-medium transition-colors",
                                    current && vi === actualVariantIndex
                                      ? "bg-primary font-semibold text-primary-foreground"
                                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                                  )}
                                >
                                  {v.label}
                                </button>
                              ))}
                            </div>
                            {item.variants.length < 2 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStep(index);
                                  patchStep(index, addVariant(item));
                                  setVariantIndex(1);
                                }}
                                className="flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                <Plus className="h-3 w-3" /> A/B
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStep(index);
                                  patchStep(index, removeVariant(item, 1));
                                  setVariantIndex(0);
                                }}
                                className="text-[10px] font-medium text-destructive hover:underline"
                              >
                                Remove B
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* Right Side: Compose Section */}
              {activeStep && activeVariant && (
                <div className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">
                        {selectedStep === 0 ? "Initial Email" : `Follow-up ${selectedStep}`}
                      </span>
                      {activeStep.variants.length > 1 && (
                        <Badge variant="outline" className="text-xs">
                          Variant {activeVariant.label}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move step up"
                        disabled={selectedStep === 0}
                        onClick={() => {
                          setSteps(moveStep(steps, selectedStep, -1));
                          setSelectedStep((s) => s - 1);
                        }}
                      >
                        <ChevronUp className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Move step down"
                        disabled={selectedStep === steps.length - 1}
                        onClick={() => {
                          setSteps(moveStep(steps, selectedStep, 1));
                          setSelectedStep((s) => s + 1);
                        }}
                      >
                        <ChevronDown className="size-4" />
                      </Button>
                      {steps.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove step"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            const nextSteps = removeStep(steps, selectedStep);
                            setSteps(nextSteps);
                            setSelectedStep((s) => Math.min(s, Math.max(0, nextSteps.length - 1)));
                            setVariantIndex(0);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Subject input + Variable chips */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="step-subject">Subject</Label>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {activeVariant.subject.length}/500
                      </span>
                    </div>
                    <Input
                      ref={subjectRef}
                      id="step-subject"
                      value={activeVariant.subject}
                      onChange={(e) =>
                        patchVariant(selectedStep, actualVariantIndex, { subject: e.target.value })
                      }
                      placeholder="Quick question, {{first_name}}"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {PRIMARY_VARS.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => insertVariable(`{{${v}}}`)}
                          className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Single Compose Area with Formatted/Plain Toggle in Bottom Right */}
                  <div className="space-y-2">
                    <Label htmlFor="step-body">Email body</Label>
                    <div className="relative rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/40">
                      {bodyMode === "formatted" ? (
                        <Textarea
                          ref={textRef}
                          id="step-body"
                          rows={14}
                          value={activeVariant.bodyText}
                          onChange={(e) =>
                            patchVariant(selectedStep, actualVariantIndex, {
                              bodyText: e.target.value,
                              bodyHtml: `<p>${e.target.value.replace(/\n/g, "<br>")}</p>`,
                            })
                          }
                          placeholder={`Hi {{first_name}},\n\nI noticed {{company}} and wanted to reach out…`}
                          className="min-h-[380px] resize-y border-0 bg-transparent p-4 text-sm leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      ) : (
                        <Textarea
                          ref={textRef}
                          id="step-body"
                          rows={14}
                          value={activeVariant.bodyText}
                          onChange={(e) =>
                            patchVariant(selectedStep, actualVariantIndex, {
                              bodyText: e.target.value,
                              bodyHtml: `<p>${e.target.value.replace(/\n/g, "<br>")}</p>`,
                            })
                          }
                          placeholder="Plain text email body…"
                          className="min-h-[380px] resize-y border-0 bg-transparent p-4 font-mono text-xs leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      )}

                      {/* Bottom-right Formatted vs Plain text Toggle */}
                      <div className="flex items-center justify-between border-t border-border/50 bg-muted/20 px-3 py-1.5">
                        <span className="text-[11px] text-muted-foreground">
                          {bodyMode === "formatted" ? "Rich text formatting" : "Standard plain text"}
                        </span>
                        <div className="flex items-center gap-1 rounded-md border border-border/80 bg-background p-0.5 text-xs shadow-2xs">
                          <button
                            type="button"
                            onClick={() => setBodyMode("formatted")}
                            className={cn(
                              "rounded px-2.5 py-0.5 font-medium transition-colors text-[11px]",
                              bodyMode === "formatted"
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            Formatted
                          </button>
                          <button
                            type="button"
                            onClick={() => setBodyMode("plain")}
                            className={cn(
                              "rounded px-2.5 py-0.5 font-medium transition-colors text-[11px]",
                              bodyMode === "plain"
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            Plain text
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Schedule & Settings */}
        {step === 5 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">Schedule & Settings</h2>
              <p className="text-sm text-muted-foreground">
                Set when your emails go out and tune sending limits to protect domain deliverability.
              </p>
            </div>

            {/* Section 1: Sending Schedule */}
            <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
              <h3 className="flex items-center gap-2 font-medium text-sm">
                <Clock className="size-4 text-primary" /> Sending Schedule
              </h3>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={startMode === "now" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStartMode("now")}
                >
                  <Rocket className="h-4 w-4" /> Start immediately
                </Button>
                <Button
                  type="button"
                  variant={startMode === "later" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStartMode("later")}
                >
                  <Clock className="h-4 w-4" /> Start later
                </Button>
              </div>

              {startMode === "later" && (
                <div className="space-y-2">
                  <Label htmlFor="c-when">Start date & time</Label>
                  <Input
                    id="c-when"
                    type="datetime-local"
                    value={scheduledAt}
                    aria-invalid={!!fieldMessage("scheduledAt")}
                    aria-describedby={fieldMessage("scheduledAt") ? "err-scheduledAt" : undefined}
                    className={fieldMessage("scheduledAt") ? INVALID : undefined}
                    onChange={(e) => {
                      setScheduledAt(e.target.value);
                      clearField("scheduledAt");
                    }}
                  />
                  {fieldMessage("scheduledAt") ? (
                    <p id="err-scheduledAt" className="text-sm text-destructive">
                      {fieldMessage("scheduledAt")}
                    </p>
                  ) : null}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="c-tz">Sending timezone</Label>
                  <Select
                    value={sendingTimezone}
                    onValueChange={(v) => {
                      setSendingTimezone(v);
                      clearField("sendingTimezone");
                    }}
                  >
                    <SelectTrigger
                      id="c-tz"
                      aria-invalid={!!fieldMessage("sendingTimezone")}
                      aria-describedby={fieldMessage("sendingTimezone") ? "err-tz" : undefined}
                      className={fieldMessage("sendingTimezone") ? INVALID : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(TIMEZONES as readonly string[]).map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {fieldMessage("sendingTimezone") ? (
                    <p id="err-tz" className="text-sm text-destructive">
                      {fieldMessage("sendingTimezone")}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Sending window</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="c-window-start"
                      type="time"
                      step={60}
                      value={windowStart}
                      aria-label="Sending window start"
                      aria-invalid={!!fieldMessage("sendingWindowStart")}
                      aria-describedby={fieldMessage("sendingWindowStart") ? "err-window-start" : undefined}
                      className={fieldMessage("sendingWindowStart") ? INVALID : undefined}
                      onChange={(e) => {
                        setWindowStart(normalizeHhMm(e.target.value));
                        clearField("sendingWindowStart");
                      }}
                    />
                    <span className="text-muted-foreground" aria-hidden>
                      –
                    </span>
                    <Input
                      id="c-window-end"
                      type="time"
                      step={60}
                      value={windowEnd}
                      aria-label="Sending window end"
                      aria-invalid={!!fieldMessage("sendingWindowEnd")}
                      aria-describedby={fieldMessage("sendingWindowEnd") ? "err-window-end" : undefined}
                      className={fieldMessage("sendingWindowEnd") ? INVALID : undefined}
                      onChange={(e) => {
                        setWindowEnd(normalizeHhMm(e.target.value));
                        clearField("sendingWindowEnd");
                      }}
                    />
                  </div>
                  {fieldMessage("sendingWindowStart") ? (
                    <p id="err-window-start" className="text-sm text-destructive">
                      {fieldMessage("sendingWindowStart")}
                    </p>
                  ) : null}
                  {fieldMessage("sendingWindowEnd") ? (
                    <p id="err-window-end" className="text-sm text-destructive">
                      {fieldMessage("sendingWindowEnd")}
                    </p>
                  ) : null}
                </div>
              </div>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Business days only (Mon–Fri)</span>
                <Switch checked={businessDaysOnly} onCheckedChange={setBusinessDaysOnly} />
              </label>
            </div>

            {/* Section 2: Delivery & Rate Limits */}
            <div className="space-y-4 rounded-xl border border-border/70 bg-card p-4">
              <h3 className="flex items-center gap-2 font-medium text-sm">
                <ShieldCheck className="size-4 text-primary" /> Delivery & Safeguards
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Daily campaign limit"
                  hint="Max emails this campaign sends per day"
                  htmlFor="c-daily"
                  error={fieldMessage("dailyLimit")}
                >
                  <Input
                    id="c-daily"
                    type="number"
                    min={1}
                    value={dailyLimit}
                    aria-invalid={!!fieldMessage("dailyLimit")}
                    aria-describedby={fieldMessage("dailyLimit") ? "c-daily-error" : undefined}
                    className={fieldMessage("dailyLimit") ? INVALID : undefined}
                    onChange={(e) => {
                      setDailyLimit(Number(e.target.value));
                      clearField("dailyLimit");
                    }}
                  />
                </Field>
                <Field
                  label="Max per sender / day"
                  hint="Cap per inbox across all campaigns"
                  htmlFor="c-per-sender"
                  error={fieldMessage("maxEmailsPerSenderPerDay")}
                >
                  <Input
                    id="c-per-sender"
                    type="number"
                    min={1}
                    value={perSender}
                    aria-invalid={!!fieldMessage("maxEmailsPerSenderPerDay")}
                    aria-describedby={fieldMessage("maxEmailsPerSenderPerDay") ? "c-per-sender-error" : undefined}
                    className={fieldMessage("maxEmailsPerSenderPerDay") ? INVALID : undefined}
                    onChange={(e) => {
                      setPerSender(Number(e.target.value));
                      clearField("maxEmailsPerSenderPerDay");
                    }}
                  />
                </Field>
                <Field
                  label="Min delay (sec)"
                  hint="Randomized lower bound"
                  htmlFor="c-min-delay"
                  error={fieldMessage("minDelaySec")}
                >
                  <Input
                    id="c-min-delay"
                    type="number"
                    min={5}
                    value={minDelay}
                    aria-invalid={!!fieldMessage("minDelaySec")}
                    aria-describedby={fieldMessage("minDelaySec") ? "c-min-delay-error" : undefined}
                    className={fieldMessage("minDelaySec") ? INVALID : undefined}
                    onChange={(e) => {
                      setMinDelay(Number(e.target.value));
                      clearField("minDelaySec");
                    }}
                  />
                </Field>
                <Field
                  label="Max delay (sec)"
                  hint="Randomized upper bound"
                  htmlFor="c-max-delay"
                  error={fieldMessage("maxDelaySec")}
                >
                  <Input
                    id="c-max-delay"
                    type="number"
                    min={5}
                    value={maxDelay}
                    aria-invalid={!!fieldMessage("maxDelaySec")}
                    aria-describedby={fieldMessage("maxDelaySec") ? "c-max-delay-error" : undefined}
                    className={fieldMessage("maxDelaySec") ? INVALID : undefined}
                    onChange={(e) => {
                      setMaxDelay(Number(e.target.value));
                      clearField("maxDelaySec");
                    }}
                  />
                </Field>
                <Field
                  label="Retry count"
                  hint="Attempts for failed sends"
                  htmlFor="c-retry"
                  error={fieldMessage("retryCount")}
                >
                  <Input
                    id="c-retry"
                    type="number"
                    min={0}
                    max={10}
                    value={retryCount}
                    aria-invalid={!!fieldMessage("retryCount")}
                    aria-describedby={fieldMessage("retryCount") ? "c-retry-error" : undefined}
                    className={fieldMessage("retryCount") ? INVALID : undefined}
                    onChange={(e) => {
                      setRetryCount(Number(e.target.value));
                      clearField("retryCount");
                    }}
                  />
                </Field>
              </div>

              {maxDelay < minDelay && !fieldMessage("maxDelaySec") ? (
                <p className="text-sm text-destructive">Max delay must be ≥ min delay.</p>
              ) : null}

              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Stop sending after a reply</span>
                <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
                <span className="text-sm">Retry failed emails</span>
                <Switch checked={retryFailed} onCheckedChange={setRetryFailed} />
              </label>
            </div>
          </div>
        )}

        {/* Step 6: Preview & Launch (Information-Dense & Clean Overview) */}
        {step === 6 && (
          <div className="space-y-5">
            {/* Top Overview Bar */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">Ready to publish</span>
                  <h2 className="text-xl font-bold text-foreground">{name || "Untitled campaign"}</h2>
                </div>
                <Badge variant={startMode === "now" ? "default" : "outline"} className="text-xs">
                  {startMode === "now" ? "Starts immediately" : `Scheduled for ${scheduledAt}`}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-card/80 p-2.5 border border-border/50">
                  <span className="text-[11px] text-muted-foreground">Target Leads</span>
                  <p className="font-semibold text-sm">{listLeadCount} leads</p>
                </div>
                <div className="rounded-lg bg-card/80 p-2.5 border border-border/50">
                  <span className="text-[11px] text-muted-foreground">Connected Senders</span>
                  <p className="font-semibold text-sm">{senderIds.size} inboxes</p>
                </div>
                <div className="rounded-lg bg-card/80 p-2.5 border border-border/50">
                  <span className="text-[11px] text-muted-foreground">Sequence</span>
                  <p className="font-semibold text-sm">{steps.length} step{steps.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-lg bg-card/80 p-2.5 border border-border/50">
                  <span className="text-[11px] text-muted-foreground">Pace & Limits</span>
                  <p className="font-semibold text-sm">~{minDelay}–{maxDelay}s</p>
                </div>
              </div>
            </div>

            {/* Information Dense 2-Column Summary */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Left Deck: Audience & Sending Engine */}
              <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 text-xs">
                <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                  <Users className="size-4 text-primary" /> Audience & Senders
                </h3>
                <div className="space-y-2 divide-y divide-border/40">
                  <div className="pt-2 flex justify-between">
                    <span className="text-muted-foreground">Lead list</span>
                    <span className="font-medium text-foreground">{selectedList?.name ?? "None selected"} ({listLeadCount} leads)</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-muted-foreground">Senders</span>
                    <span className="font-medium text-foreground">{senderIds.size} accounts selected</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-muted-foreground">Sending window</span>
                    <span className="font-medium text-foreground">{windowStart} – {windowEnd} ({sendingTimezone})</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-muted-foreground">Active days</span>
                    <span className="font-medium text-foreground">{businessDaysOnly ? "Mon – Fri only" : "Every day"}</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-muted-foreground">Daily cap</span>
                    <span className="font-medium text-foreground">{dailyLimit} emails / day</span>
                  </div>
                  <div className="pt-2 flex justify-between">
                    <span className="text-muted-foreground">Stop on reply</span>
                    <span className="font-medium text-foreground">{stopOnReply ? "Yes" : "No"}</span>
                  </div>
                </div>
              </div>

              {/* Right Deck: Sequence Overview */}
              <div className="space-y-3 rounded-xl border border-border/80 bg-card p-4 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                    <Mail className="size-4 text-primary" /> Sequence Steps
                  </h3>
                  <button
                    type="button"
                    onClick={() => setLiveSampleLead(!liveSampleLead)}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Sparkles className="size-3" />
                    {liveSampleLead ? "Raw template" : "Preview lead merge"}
                  </button>
                </div>

                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {steps.map((st, idx) => {
                    const variantA = st.variants[0];
                    const subjectRaw = variantA?.subject || "(No subject)";
                    const bodyRaw = variantA?.bodyText || "(No body text)";
                    const subjectDisplay = liveSampleLead ? renderWithSampleLead(subjectRaw) : subjectRaw;
                    const bodyDisplay = liveSampleLead ? renderWithSampleLead(bodyRaw) : bodyRaw;

                    return (
                      <div key={st.key} className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {idx === 0 ? "1. Initial Email" : `${idx + 1}. Follow-up ${idx}`}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {idx === 0 ? "Immediate" : `Wait ${st.delayDays}d`}
                            {st.variants.length > 1 ? " · A/B Split" : ""}
                          </span>
                        </div>
                        <p className="font-medium text-foreground truncate">{subjectDisplay}</p>
                        <p className="line-clamp-2 text-muted-foreground whitespace-pre-wrap">{bodyDisplay}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {draftLoadError && !draftId ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          Could not open that draft ({draftLoadError}). You can start a new campaign here.
        </p>
      ) : null}

      {stepHint || error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
        >
          {error ?? stepHint}
        </p>
      ) : notice ? (
        <p role="status" className="rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={back} disabled={step === 1 || pending}>
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={saveDraft} disabled={pending}>
            {pending && pendingKind === "draft" ? "Saving…" : "Save as Draft"}
          </Button>
          {step < 6 ? (
            <Button type="button" onClick={next} disabled={pending}>
              Next <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={pending}>
              {pending && pendingKind === "publish"
                ? "Publishing…"
                : startMode === "now"
                  ? "Start Campaign"
                  : "Publish Campaign"}
              <Rocket className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      {/* Save Sequence as Template Dialog */}
      <Dialog open={saveSeqOpen} onOpenChange={setSaveSeqOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="size-5 text-primary" /> Save Sequence as Template
            </DialogTitle>
            <DialogDescription>
              Save this {steps.length}-step sequence with all subject lines, intervals, and body copy to your reusable library.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSequenceAsTemplate} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="seq-template-name">Template Name</Label>
              <Input
                id="seq-template-name"
                value={saveSeqName}
                onChange={(e) => setSaveSeqName(e.target.value)}
                placeholder="e.g. 3-Step Tech Follow Up"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seq-template-desc">Description (Optional)</Label>
              <Input
                id="seq-template-desc"
                value={saveSeqDesc}
                onChange={(e) => setSaveSeqDesc(e.target.value)}
                placeholder="e.g. Proven 18% reply rate for B2B executives"
              />
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Sequence Summary:</div>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                <li>{steps.length} sequential email step{steps.length !== 1 ? "s" : ""}</li>
                <li>{steps.reduce((acc, s) => acc + s.variants.length, 0)} total message variant(s)</li>
                <li>Instant 1-click loading into future campaigns</li>
              </ul>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setSaveSeqOpen(false)} disabled={saveSeqPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveSeqPending || !saveSeqName.trim()}>
                {saveSeqPending ? "Saving..." : "Save Sequence"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

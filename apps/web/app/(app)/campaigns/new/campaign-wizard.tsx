"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clock, FileText, Mail, Plus, Rocket, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { TIMEZONES } from "@smartreach/shared";
import {
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
import { createLeadList, publishCampaign, saveCampaignDraft, upsertTemplate } from "@/lib/actions";
import {
  CAMPAIGN_FIELD_CONTROL_ID,
  CAMPAIGN_FIELD_STEP,
  firstFailingCampaignField,
  firstFailingCampaignStep,
} from "@/lib/campaign-wizard-errors";
import { normalizeHhMm } from "@/lib/hhmm";
import { LeadImport } from "../../leads/import/lead-import";

interface LeadListOpt { id: string; name: string; leadCount: number }
interface SenderOpt { id: string; senderName: string; email: string; status: string; dailyLimit: number; usedToday: number }
interface TemplateOpt { id: string; name: string; subject: string }

const STEPS = [
  { id: 1, label: "Name" },
  { id: 2, label: "Leads" },
  { id: 3, label: "Senders" },
  { id: 4, label: "Template" },
  { id: 5, label: "Schedule" },
  { id: 6, label: "Settings" },
];

const INVALID = "border-destructive ring-2 ring-destructive/40";

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

export function CampaignWizard({
  leadLists,
  senders,
  templates,
  initialDraft,
  draftLoadError,
}: {
  leadLists: LeadListOpt[];
  senders: SenderOpt[];
  templates: TemplateOpt[];
  initialDraft?: CampaignDraftSeed | null;
  draftLoadError?: string | null;
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
  const [listOpen, setListOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  // Form state — hydrated from /campaigns/new?draft=
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [lists, setLists] = useState(leadLists);
  const [leadListId, setLeadListId] = useState(initialDraft?.leadListId ?? "");
  const [senderIds, setSenderIds] = useState<Set<string>>(() => new Set(initialDraft?.senderIds ?? []));
  const [templateOpts, setTemplateOpts] = useState(templates);
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

  const toggleSender = (id: string) =>
    setSenderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedTemplate = useMemo(() => templateOpts.find((t) => t.id === templateId), [templateOpts, templateId]);
  const listLeadCount = lists.find((l) => l.id === leadListId)?.leadCount ?? 0;

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

  const stepValid = (s: number): boolean => {
    switch (s) {
      case 1: return name.trim().length > 0;
      case 2: return !!leadListId;
      case 3: return senderIds.size > 0;
      case 4: return !!templateId;
      case 5: return startMode === "now" || !!scheduledAt;
      case 6: return maxDelay >= minDelay;
      default: return true;
    }
  };

  const STEP_HINT: Record<number, string> = {
    1: "Enter a campaign name to continue.",
    2: "Select a lead list to continue.",
    3: "Select at least one sender account.",
    4: "Select an email template.",
    5: "Pick a start date and time, or choose Start immediately.",
    6: "Max delay must be ≥ min delay.",
  };

  const progressPct = Math.round(((step - 1) / (STEPS.length - 1)) * 100);
  const stepHasError = (id: number) =>
    Object.keys(fieldErrors).some((key) => !!fieldErrors[key]?.length && CAMPAIGN_FIELD_STEP[key] === id);

  const next = () => {
    setError(null);
    setNotice(null);
    setFieldErrors({});
    if (!stepValid(step)) { setStepHint(STEP_HINT[step] ?? "Complete this step to continue."); return; }
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
          rememberDraft(res.data.id);
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
        const res = await publishCampaign({
          ...(draftId ? { id: draftId } : {}),
          name: name.trim(),
          leadListId,
          senderIds: [...senderIds],
          templateId,
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
        });
        if (res.ok && res.data?.id) {
          router.push(`/campaigns/${res.data.id}`);
          return;
        }
        applyFailure(res.ok ? "Could not publish campaign" : res.error, res.ok ? {} : (res.fieldErrors ?? {}));
      } finally {
        setPendingKind(null);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>Step {step} of {STEPS.length}<span className="hidden sm:inline"> · {STEPS[step - 1]?.label}</span></span>
          <span className="tabular-nums">{progressPct}%</span>
        </div>
        <Progress value={progressPct} className="h-1.5" aria-label={`Campaign wizard ${progressPct}% complete`} />
        <ol className="flex flex-wrap items-center gap-y-2" aria-label="Campaign wizard steps">
          {STEPS.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => { if (s.id < step) { setStepHint(null); setError(null); setNotice(null); setFieldErrors({}); setStep(s.id); } }}
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
              <span className={cn("hidden text-xs sm:inline", s.id === step ? "font-medium text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="mx-1.5 hidden h-px w-4 bg-border sm:mx-2 sm:inline-block sm:w-6" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Name your campaign</h2>
              <p className="text-sm text-muted-foreground">Something you'll recognize at a glance.</p>
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
                onChange={(e) => { setName(e.target.value); clearField("name"); }}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="e.g. Q1 SaaS founders — US"
              />
              {fieldMessage("name") ? <p id="err-name" className="text-sm text-destructive">{fieldMessage("name")}</p> : null}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Choose a lead list</h2>
                <p className="text-sm text-muted-foreground">Pending leads from this list will be queued.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setListOpen(true)}>
                  <Plus className="size-4" aria-hidden /> New list
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="size-4" aria-hidden /> Import leads
                </Button>
              </div>
            </div>
            {lists.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No lead lists yet"
                description="Create a list or import a CSV without leaving this campaign."
                className="py-10"
              />
            ) : (
              <div
                id="lead-list-group"
                tabIndex={-1}
                role="group"
                aria-label="Lead lists"
                aria-invalid={!!fieldMessage("leadListId") || undefined}
                aria-describedby={fieldMessage("leadListId") ? "err-leadListId" : undefined}
                className={cn("space-y-2 rounded-lg outline-none", fieldMessage("leadListId") && "ring-2 ring-destructive/40")}
              >
                {lists.map((l) => {
                  const selected = leadListId === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => { setLeadListId(l.id); clearField("leadListId"); }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg p-4 text-left transition-colors",
                        selected
                          ? "border-2 border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border hover:bg-accent/50",
                        fieldMessage("leadListId") && !selected && "border-destructive",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        {selected ? (
                          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        ) : null}
                        <span className="truncate">{l.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{l.leadCount} leads</span>
                    </button>
                  );
                })}
                {fieldMessage("leadListId") ? (
                  <p id="err-leadListId" className="text-sm text-destructive">{fieldMessage("leadListId")}</p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose sender accounts</h2>
              <p className="text-sm text-muted-foreground">
                The engine rotates across these, respecting each inbox's daily limit.
              </p>
            </div>
            {senders.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No sender accounts"
                description="Connect at least one mailbox (single or bulk CSV) before you can send."
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
                className={cn("space-y-2 rounded-lg outline-none", fieldMessage("senderIds") && "ring-2 ring-destructive/40")}
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
                  <label key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
                      senderIds.has(s.id) ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                    )}>
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={senderIds.has(s.id)} onChange={() => { toggleSender(s.id); clearField("senderIds"); }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.senderName} <span className="font-normal text-muted-foreground">· {s.email}</span></p>
                      <p className="text-xs text-muted-foreground">{s.usedToday}/{s.dailyLimit} used today · {s.status}</p>
                    </div>
                  </label>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">{senderIds.size} selected</p>
                {fieldMessage("senderIds") ? (
                  <p id="err-senderIds" className="text-sm text-destructive">{fieldMessage("senderIds")}</p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Choose an email template</h2>
                <p className="text-sm text-muted-foreground">Preview shown once selected.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setTemplateOpen(true)}>
                <Plus className="size-4" aria-hidden /> New template
              </Button>
            </div>
            {templateOpts.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No templates yet"
                description="Write a template here. It is selected as soon as you save it."
                className="py-10"
              />
            ) : (
              <>
                <div
                  id="template-group"
                  tabIndex={-1}
                  role="group"
                  aria-label="Email templates"
                  aria-invalid={!!fieldMessage("templateId") || undefined}
                  aria-describedby={fieldMessage("templateId") ? "err-templateId" : undefined}
                  className={cn("space-y-2 rounded-lg outline-none", fieldMessage("templateId") && "ring-2 ring-destructive/40")}
                >
                  {templateOpts.map((t) => (
                    <button key={t.id} type="button" onClick={() => { setTemplateId(t.id); clearField("templateId"); }}
                      className={cn(
                        "flex w-full flex-col rounded-lg border p-4 text-left transition-colors",
                        templateId === t.id ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                        fieldMessage("templateId") && templateId !== t.id && "border-destructive",
                      )}>
                      <span className="font-medium">{t.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{t.subject}</span>
                    </button>
                  ))}
                  {fieldMessage("templateId") ? (
                    <p id="err-templateId" className="text-sm text-destructive">{fieldMessage("templateId")}</p>
                  ) : null}
                </div>
                {selectedTemplate && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <p className="text-xs font-medium text-muted-foreground">Subject preview</p>
                    <p className="mt-1 text-sm">{selectedTemplate.subject}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Schedule</h2>
              <p className="text-sm text-muted-foreground">Start now or pick a time. Sending respects the window & timezone.</p>
            </div>
            <div className="flex gap-3">
              <Button type="button" variant={startMode === "now" ? "default" : "outline"} size="sm" onClick={() => setStartMode("now")}>
                <Rocket className="h-4 w-4" /> Start immediately
              </Button>
              <Button type="button" variant={startMode === "later" ? "default" : "outline"} size="sm" onClick={() => setStartMode("later")}>
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
                  onChange={(e) => { setScheduledAt(e.target.value); clearField("scheduledAt"); }}
                />
                {fieldMessage("scheduledAt") ? (
                  <p id="err-scheduledAt" className="text-sm text-destructive">{fieldMessage("scheduledAt")}</p>
                ) : null}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="c-tz">Sending timezone</Label>
                <Select value={sendingTimezone} onValueChange={(v) => { setSendingTimezone(v); clearField("sendingTimezone"); }}>
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
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldMessage("sendingTimezone") ? (
                  <p id="err-tz" className="text-sm text-destructive">{fieldMessage("sendingTimezone")}</p>
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
                    onChange={(e) => { setWindowStart(normalizeHhMm(e.target.value)); clearField("sendingWindowStart"); }}
                  />
                  <span className="text-muted-foreground" aria-hidden>–</span>
                  <Input
                    id="c-window-end"
                    type="time"
                    step={60}
                    value={windowEnd}
                    aria-label="Sending window end"
                    aria-invalid={!!fieldMessage("sendingWindowEnd")}
                    aria-describedby={fieldMessage("sendingWindowEnd") ? "err-window-end" : undefined}
                    className={fieldMessage("sendingWindowEnd") ? INVALID : undefined}
                    onChange={(e) => { setWindowEnd(normalizeHhMm(e.target.value)); clearField("sendingWindowEnd"); }}
                  />
                </div>
                {fieldMessage("sendingWindowStart") ? (
                  <p id="err-window-start" className="text-sm text-destructive">{fieldMessage("sendingWindowStart")}</p>
                ) : null}
                {fieldMessage("sendingWindowEnd") ? (
                  <p id="err-window-end" className="text-sm text-destructive">{fieldMessage("sendingWindowEnd")}</p>
                ) : null}
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Business days only (Mon–Fri)</span>
              <Switch checked={businessDaysOnly} onCheckedChange={setBusinessDaysOnly} />
            </label>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Sending settings</h2>
              <p className="text-sm text-muted-foreground">Sensible defaults pre-filled. Only change if you need to.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Daily campaign limit" hint="Max emails this campaign sends per day" htmlFor="c-daily" error={fieldMessage("dailyLimit")}>
                <Input
                  id="c-daily"
                  type="number"
                  min={1}
                  value={dailyLimit}
                  aria-invalid={!!fieldMessage("dailyLimit")}
                  aria-describedby={fieldMessage("dailyLimit") ? "c-daily-error" : undefined}
                  className={fieldMessage("dailyLimit") ? INVALID : undefined}
                  onChange={(e) => { setDailyLimit(Number(e.target.value)); clearField("dailyLimit"); }}
                />
              </Field>
              <Field label="Max per sender / day" hint="Cap per inbox across all campaigns" htmlFor="c-per-sender" error={fieldMessage("maxEmailsPerSenderPerDay")}>
                <Input
                  id="c-per-sender"
                  type="number"
                  min={1}
                  value={perSender}
                  aria-invalid={!!fieldMessage("maxEmailsPerSenderPerDay")}
                  aria-describedby={fieldMessage("maxEmailsPerSenderPerDay") ? "c-per-sender-error" : undefined}
                  className={fieldMessage("maxEmailsPerSenderPerDay") ? INVALID : undefined}
                  onChange={(e) => { setPerSender(Number(e.target.value)); clearField("maxEmailsPerSenderPerDay"); }}
                />
              </Field>
              <Field label="Min delay (sec)" hint="Randomized lower bound" htmlFor="c-min-delay" error={fieldMessage("minDelaySec")}>
                <Input
                  id="c-min-delay"
                  type="number"
                  min={5}
                  value={minDelay}
                  aria-invalid={!!fieldMessage("minDelaySec")}
                  aria-describedby={fieldMessage("minDelaySec") ? "c-min-delay-error" : undefined}
                  className={fieldMessage("minDelaySec") ? INVALID : undefined}
                  onChange={(e) => { setMinDelay(Number(e.target.value)); clearField("minDelaySec"); }}
                />
              </Field>
              <Field label="Max delay (sec)" hint="Randomized upper bound" htmlFor="c-max-delay" error={fieldMessage("maxDelaySec")}>
                <Input
                  id="c-max-delay"
                  type="number"
                  min={5}
                  value={maxDelay}
                  aria-invalid={!!fieldMessage("maxDelaySec")}
                  aria-describedby={fieldMessage("maxDelaySec") ? "c-max-delay-error" : undefined}
                  className={fieldMessage("maxDelaySec") ? INVALID : undefined}
                  onChange={(e) => { setMaxDelay(Number(e.target.value)); clearField("maxDelaySec"); }}
                />
              </Field>
              <Field label="Retry count" hint="Attempts for failed sends" htmlFor="c-retry" error={fieldMessage("retryCount")}>
                <Input
                  id="c-retry"
                  type="number"
                  min={0}
                  max={10}
                  value={retryCount}
                  aria-invalid={!!fieldMessage("retryCount")}
                  aria-describedby={fieldMessage("retryCount") ? "c-retry-error" : undefined}
                  className={fieldMessage("retryCount") ? INVALID : undefined}
                  onChange={(e) => { setRetryCount(Number(e.target.value)); clearField("retryCount"); }}
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

            <div className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
              Sending <strong className="text-foreground">{listLeadCount}</strong> leads via{" "}
              <strong className="text-foreground">{senderIds.size}</strong> sender{senderIds.size !== 1 && "s"} ·{" "}
              ~{minDelay}–{maxDelay}s apart · {startMode === "now" ? "starts immediately" : "scheduled"}.
            </div>
          </div>
        )}
      </div>

      {draftLoadError && !draftId ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          Could not open that draft ({draftLoadError}). You can start a new campaign here.
        </p>
      ) : null}

      {(stepHint || error) ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
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
              {pending && pendingKind === "publish" ? "Publishing…" : startMode === "now" ? "Start" : "Publish"}
              <Rocket className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <NewListDialog
        open={listOpen}
        onOpenChange={setListOpen}
        onCreated={(list) => {
          setLists((prev) => prev.some((l) => l.id === list.id) ? prev : [...prev, { ...list, leadCount: 0 }]);
          setLeadListId(list.id);
          clearField("leadListId");
          setListOpen(false);
          toast.success(`List “${list.name}” selected`);
        }}
      />
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import leads</DialogTitle>
            <DialogDescription>
              Upload a CSV. The list stays selected in this campaign.
            </DialogDescription>
          </DialogHeader>
          {importOpen ? (
            <LeadImport
              lists={lists.map((l) => ({ id: l.id, name: l.name }))}
              initialListId={leadListId || "__new__"}
              onImported={({ listId, listName, imported }) => {
                setLists((prev) => {
                  const existing = prev.find((l) => l.id === listId);
                  if (!existing) return [...prev, { id: listId, name: listName, leadCount: imported }];
                  return prev.map((l) =>
                    l.id === listId ? { ...l, name: listName || l.name, leadCount: l.leadCount + imported } : l,
                  );
                });
                setLeadListId(listId);
                clearField("leadListId");
                setImportOpen(false);
                toast.success(`Imported ${imported} leads into ${listName}`);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <NewTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onCreated={(template) => {
          setTemplateOpts((prev) => prev.some((t) => t.id === template.id) ? prev : [...prev, template]);
          setTemplateId(template.id);
          clearField("templateId");
          setTemplateOpen(false);
          toast.success(`Template “${template.name}” selected`);
        }}
      />
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

function NewListDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (list: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the list a name");
      return;
    }
    start(async () => {
      setError(null);
      const res = await createLeadList({ name: trimmed });
      if (res.ok && res.data?.id) {
        onCreated({ id: res.data.id, name: trimmed });
        return;
      }
      setError(res.ok ? "Could not create list" : res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New lead list</DialogTitle>
          <DialogDescription>The list is selected in this campaign as soon as you create it.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="inline-list-name">List name</Label>
            <Input
              id="inline-list-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q1 SaaS founders"
              autoFocus
              aria-invalid={!!error}
              aria-describedby={error ? "inline-list-error" : undefined}
            />
            {error ? (
              <p id="inline-list-error" role="alert" className="text-sm text-destructive">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create list"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (template: TemplateOpt) => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) {
      setName("");
      setSubject("");
      setBodyText("");
      setError(null);
    }
  }, [open]);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await upsertTemplate({
        name: name.trim(),
        subject: subject.trim(),
        bodyText,
        bodyHtml: "",
        format: "text",
      });
      if (res.ok && res.data?.id) {
        onCreated({ id: res.data.id, name: name.trim(), subject: subject.trim() });
        return;
      }
      setError(res.ok ? "Could not create template" : res.error);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>Saved templates are selected in this campaign immediately.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="inline-template-name">Template name</Label>
            <Input
              id="inline-template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Founder outreach v1"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inline-template-subject">Subject</Label>
            <Input
              id="inline-template-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Quick question, {{first_name}}"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inline-template-body">Body</Label>
            <Textarea
              id="inline-template-body"
              rows={6}
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={"Hi {{first_name}},\n\nI noticed {{company}}…"}
            />
          </div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !subject.trim()}>
              {pending ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

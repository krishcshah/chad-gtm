"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clock, FileText, Mail, Rocket, Users } from "lucide-react";
import { TIMEZONES } from "@smartreach/shared";
import {
  Button,
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
  cn,
} from "@smartreach/ui";
import { createCampaign } from "@/lib/actions";

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

export function CampaignWizard({
  leadLists,
  senders,
  templates,
}: {
  leadLists: LeadListOpt[];
  senders: SenderOpt[];
  templates: TemplateOpt[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [stepHint, setStepHint] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [leadListId, setLeadListId] = useState("");
  const [senderIds, setSenderIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState("");
  const [startMode, setStartMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [businessDaysOnly, setBusinessDaysOnly] = useState(false);
  const [sendingTimezone, setSendingTimezone] = useState("UTC");
  const [windowStart, setWindowStart] = useState("09:00");
  const [windowEnd, setWindowEnd] = useState("17:00");
  const [dailyLimit, setDailyLimit] = useState(500);
  const [minDelay, setMinDelay] = useState(90);
  const [maxDelay, setMaxDelay] = useState(240);
  const [perSender, setPerSender] = useState(50);
  const [stopOnReply, setStopOnReply] = useState(true);
  const [retryFailed, setRetryFailed] = useState(true);
  const [retryCount, setRetryCount] = useState(2);

  const toggleSender = (id: string) =>
    setSenderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId), [templates, templateId]);
  const listLeadCount = leadLists.find((l) => l.id === leadListId)?.leadCount ?? 0;

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

  const next = () => {
    setError(null);
    if (!stepValid(step)) { setStepHint(STEP_HINT[step] ?? "Complete this step to continue."); return; }
    setStepHint(null);
    setStep((s) => Math.min(6, s + 1));
  };
  const back = () => { setError(null); setStepHint(null); setStep((s) => Math.max(1, s - 1)); };

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createCampaign({
        name: name.trim(),
        leadListId,
        senderIds: [...senderIds],
        templateId,
        startMode,
        scheduledAt: startMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        businessDaysOnly,
        sendingTimezone,
        sendingWindowStart: windowStart,
        sendingWindowEnd: windowEnd,
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
      } else {
        setError(res.ok ? "Unknown error" : res.error);
      }
    });

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
                onClick={() => { if (s.id < step) { setStepHint(null); setError(null); setStep(s.id); } }}
                disabled={s.id > step}
                aria-current={s.id === step ? "step" : undefined}
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  s.id === step
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : s.id < step
                      ? "bg-success/20 text-success-foreground hover:bg-success/30"
                      : "bg-muted text-muted-foreground",
                  s.id > step && "cursor-not-allowed opacity-60",
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
              <Input id="c-name" autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="e.g. Q1 SaaS founders — US" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose a lead list</h2>
              <p className="text-sm text-muted-foreground">Pending leads from this list will be queued.</p>
            </div>
            {leadLists.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No lead lists yet"
                description="Import a CSV of prospects first, then return here to launch your campaign."
                className="py-10"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/leads/import">Import leads</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {leadLists.map((l) => {
                  const selected = leadListId === l.id;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setLeadListId(l.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg p-4 text-left transition-colors",
                        selected
                          ? "border-2 border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border hover:bg-accent/50",
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
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-2.5">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={senders.length > 0 && senderIds.size === senders.length}
                      onChange={(e) =>
                        setSenderIds(e.target.checked ? new Set(senders.map((s) => s.id)) : new Set())
                      }
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
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={senderIds.has(s.id)} onChange={() => toggleSender(s.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.senderName} <span className="font-normal text-muted-foreground">· {s.email}</span></p>
                      <p className="text-xs text-muted-foreground">{s.usedToday}/{s.dailyLimit} used today · {s.status}</p>
                    </div>
                  </label>
                ))}
                <p className="pt-1 text-xs text-muted-foreground">{senderIds.size} selected</p>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Choose an email template</h2>
              <p className="text-sm text-muted-foreground">Preview shown on the right once selected.</p>
            </div>
            {templates.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No templates yet"
                description="Create a template with your outreach copy, then pick it here."
                className="py-10"
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/templates/new">Create template</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <div className="space-y-2">
                  {templates.map((t) => (
                    <button key={t.id} type="button" onClick={() => setTemplateId(t.id)}
                      className={cn(
                        "flex w-full flex-col rounded-lg border p-4 text-left transition-colors",
                        templateId === t.id ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                      )}>
                      <span className="font-medium">{t.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{t.subject}</span>
                    </button>
                  ))}
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
                <Input id="c-when" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Sending timezone</Label>
                <Select value={sendingTimezone} onValueChange={setSendingTimezone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(TIMEZONES as readonly string[]).map((tz) => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sending window</Label>
                <div className="flex items-center gap-2">
                  <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
                  <span className="text-muted-foreground">–</span>
                  <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
                </div>
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
              <Field label="Daily campaign limit" hint="Max emails this campaign sends per day">
                <Input type="number" min={1} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
              </Field>
              <Field label="Max per sender / day" hint="Cap per inbox across all campaigns">
                <Input type="number" min={1} value={perSender} onChange={(e) => setPerSender(Number(e.target.value))} />
              </Field>
              <Field label="Min delay (sec)" hint="Randomized lower bound">
                <Input type="number" min={5} value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} />
              </Field>
              <Field label="Max delay (sec)" hint="Randomized upper bound">
                <Input type="number" min={5} value={maxDelay} onChange={(e) => setMaxDelay(Number(e.target.value))} />
              </Field>
              <Field label="Retry count" hint="Attempts for failed sends">
                <Input type="number" min={0} max={10} value={retryCount} onChange={(e) => setRetryCount(Number(e.target.value))} />
              </Field>
            </div>
            {maxDelay < minDelay && (
              <p className="text-sm text-destructive">Max delay must be ≥ min delay.</p>
            )}
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

      {(stepHint || error) && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error ?? stepHint}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={back} disabled={step === 1 || pending}>
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Button>
        {step < 6 ? (
          <Button onClick={next} disabled={pending}>
            Next <ArrowRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending || !stepValid(6)}>
            {pending ? "Creating…" : startMode === "now" ? "Create & Start" : "Create & Schedule"}
            <Rocket className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

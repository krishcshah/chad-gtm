"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, Rocket } from "lucide-react";
import { TIMEZONES } from "@smartreach/shared";
import {
  Button,
  Input,
  Label,
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

  const next = () => { setError(null); if (stepValid(step)) setStep((s) => Math.min(6, s + 1)); };
  const back = () => { setError(null); setStep((s) => Math.max(1, s - 1)); };

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
    <div>
      {/* Step indicator */}
      <ol className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => s.id < step && setStep(s.id)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                s.id === step
                  ? "bg-primary text-primary-foreground"
                  : s.id < step
                    ? "bg-success/20 text-success-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {s.id < step ? <Check className="h-3.5 w-3.5" /> : s.id}
            </button>
            <span className={cn("hidden text-xs sm:block", s.id === step ? "text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
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
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No lead lists yet. Import a CSV first from the Leads page.
              </p>
            ) : (
              <div className="space-y-2">
                {leadLists.map((l) => (
                  <button key={l.id} type="button" onClick={() => setLeadListId(l.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors",
                      leadListId === l.id ? "border-primary bg-primary/5" : "hover:bg-accent/50",
                    )}>
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.leadCount} leads</span>
                  </button>
                ))}
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
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sender accounts. Add one from the Senders page (single or bulk CSV).
              </p>
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
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No templates. Create one from the Templates page.
              </p>
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

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 1 || pending}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {step < 6 ? (
          <Button onClick={next} disabled={!stepValid(step) || pending}>
            Next <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending || !stepValid(6)}>
            {pending ? "Creating…" : startMode === "now" ? "Create & Start" : "Create & Schedule"}
            <Rocket className="h-4 w-4" />
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

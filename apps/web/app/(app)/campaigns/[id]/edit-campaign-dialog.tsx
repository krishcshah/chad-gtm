"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Separator,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Switch,
  statusVariant,
} from "@smartreach/ui";
import { updateCampaignSettings } from "@/lib/actions";

interface SenderOption {
  id: string;
  senderName: string;
  email: string;
  status: string;
}

interface CampaignData {
  id: string;
  name: string;
  dailyLimit: number | null;
  sendingWindowStart: string | null;
  sendingWindowEnd: string | null;
  sendingTimezone: string | null;
  businessDaysOnly: boolean | null;
  stopOnReply: boolean | null;
  trackOpens?: boolean | null;
  minDelaySec: number | null;
  maxDelaySec: number | null;
  senders: { id: string; email: string; senderName?: string }[];
}

type Errors = Partial<Record<"name" | "dailyLimit" | "delay" | "senders", string>>;

function timezones(): string[] {
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    return intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    return [];
  }
}

/** Campaign settings: name, schedule, pacing, tracking and mailboxes. Opens in a side sheet. */
export function EditCampaignDialog({
  campaign,
  availableSenders,
  onGoToSequence,
}: {
  campaign: CampaignData;
  availableSenders: SenderOption[];
  onGoToSequence?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});

  const [name, setName] = useState(campaign.name);
  const [dailyLimit, setDailyLimit] = useState(String(campaign.dailyLimit ?? 500));
  const [sendingWindowStart, setSendingWindowStart] = useState(campaign.sendingWindowStart || "09:00");
  const [sendingWindowEnd, setSendingWindowEnd] = useState(campaign.sendingWindowEnd || "17:00");
  const [sendingTimezone, setSendingTimezone] = useState(campaign.sendingTimezone || "UTC");
  const [businessDaysOnly, setBusinessDaysOnly] = useState(campaign.businessDaysOnly ?? true);
  const [stopOnReply, setStopOnReply] = useState(campaign.stopOnReply ?? true);
  const [trackOpens, setTrackOpens] = useState(campaign.trackOpens ?? true);
  const [minDelaySec, setMinDelaySec] = useState(String(campaign.minDelaySec ?? 120));
  const [maxDelaySec, setMaxDelaySec] = useState(String(campaign.maxDelaySec ?? 300));
  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>(campaign.senders.map((s) => s.id));

  const tzOptions = useMemo(timezones, []);
  const tzListId = useId();
  const weekdaysId = useId();
  const stopId = useId();
  const opensId = useId();
  const mailboxHeadingId = useId();

  const toggleSender = (senderId: string) => {
    setSelectedSenderIds((prev) =>
      prev.includes(senderId) ? prev.filter((id) => id !== senderId) : [...prev, senderId],
    );
    setErrors((e) => ({ ...e, senders: undefined }));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!name.trim()) next.name = "Give the campaign a name.";
    const limit = parseInt(dailyLimit, 10);
    if (dailyLimit.trim() && (!Number.isFinite(limit) || limit < 1)) next.dailyLimit = "Enter at least 1.";
    const min = parseInt(minDelaySec, 10);
    const max = parseInt(maxDelaySec, 10);
    if (Number.isFinite(min) && Number.isFinite(max) && max < min) {
      next.delay = "The longest gap must be at least the shortest gap.";
    }
    if (selectedSenderIds.length === 0) next.senders = "Select at least one mailbox to send from.";
    return next;
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    const firstError = Object.values(found).find(Boolean);
    if (firstError) {
      // The field can be scrolled out of view in the sheet; say what is wrong as well.
      toast.error(firstError);
      return;
    }

    startTransition(async () => {
      const res = await updateCampaignSettings(campaign.id, {
        name: name.trim(),
        dailyLimit: parseInt(dailyLimit, 10) || 500,
        sendingWindowStart,
        sendingWindowEnd,
        sendingTimezone: sendingTimezone.trim() || "UTC",
        businessDaysOnly,
        stopOnReply,
        trackOpens,
        minDelaySec: parseInt(minDelaySec, 10) || 120,
        maxDelaySec: parseInt(maxDelaySec, 10) || 300,
        senderIds: selectedSenderIds,
      });

      if (res.ok) {
        toast.success(res.message ?? "Campaign settings saved");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings2 />
          Settings
        </Button>
      </SheetTrigger>
      <SheetContent>
        <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col" noValidate>
          <SheetHeader>
            <SheetTitle>Campaign settings</SheetTitle>
            <SheetDescription>Changes apply to every email that has not been sent yet.</SheetDescription>
          </SheetHeader>

          <SheetBody className="flex flex-col gap-6">
            <Field label="Name" error={errors.name} required>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((er) => ({ ...er, name: undefined }));
                }}
                placeholder="Q4 founder outreach"
                autoComplete="off"
              />
            </Field>

            {onGoToSequence ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
                <p className="text-[13px] text-muted-foreground">Subject lines, email copy and follow-up timing live in the sequence.</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    onGoToSequence();
                  }}
                >
                  Edit sequence <ArrowRight />
                </Button>
              </div>
            ) : null}

            <Separator />

            <section className="flex flex-col gap-5" aria-labelledby={`${tzListId}-schedule`}>
              <div>
                <h3 id={`${tzListId}-schedule`} className="text-[15px] font-semibold">
                  Schedule
                </h3>
                <p className="mt-1 text-[13px] text-muted-foreground">When emails go out, in the timezone you pick.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Window starts">
                  <Input
                    type="time"
                    value={sendingWindowStart}
                    onChange={(e) => setSendingWindowStart(e.target.value)}
                  />
                </Field>
                <Field label="Window ends">
                  <Input type="time" value={sendingWindowEnd} onChange={(e) => setSendingWindowEnd(e.target.value)} />
                </Field>
              </div>

              <Field label="Timezone" hint="An IANA name such as America/New_York, or UTC.">
                <Input
                  value={sendingTimezone}
                  onChange={(e) => setSendingTimezone(e.target.value)}
                  placeholder="UTC"
                  list={tzOptions.length ? tzListId : undefined}
                  autoComplete="off"
                />
              </Field>
              {tzOptions.length ? (
                <datalist id={tzListId}>
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz} />
                  ))}
                </datalist>
              ) : null}

              <ToggleRow
                id={weekdaysId}
                label="Weekdays only"
                hint="Nothing is sent on Saturday or Sunday."
                checked={businessDaysOnly}
                onChange={setBusinessDaysOnly}
              />
            </section>

            <Separator />

            <section className="flex flex-col gap-5" aria-labelledby={`${tzListId}-pace`}>
              <div>
                <h3 id={`${tzListId}-pace`} className="text-[15px] font-semibold">
                  Pace
                </h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Sending slowly with random gaps looks like a person and protects your mailboxes.
                </p>
              </div>

              <Field
                label="Daily limit"
                hint="Most emails this campaign sends per day, across all its mailboxes."
                error={errors.dailyLimit}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50000}
                  value={dailyLimit}
                  onChange={(e) => {
                    setDailyLimit(e.target.value);
                    setErrors((er) => ({ ...er, dailyLimit: undefined }));
                  }}
                  className="sm:max-w-40"
                />
              </Field>

              <div className="flex flex-col gap-2">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Shortest gap (seconds)">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={1200}
                      value={minDelaySec}
                      onChange={(e) => {
                        setMinDelaySec(e.target.value);
                        setErrors((er) => ({ ...er, delay: undefined }));
                      }}
                    />
                  </Field>
                  <Field label="Longest gap (seconds)">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={20}
                      max={3600}
                      value={maxDelaySec}
                      onChange={(e) => {
                        setMaxDelaySec(e.target.value);
                        setErrors((er) => ({ ...er, delay: undefined }));
                      }}
                    />
                  </Field>
                </div>
                {errors.delay ? (
                  <p role="alert" className="text-xs text-destructive-text">
                    {errors.delay}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">A random wait in this range is used between two emails.</p>
                )}
              </div>
            </section>

            <Separator />

            <section className="flex flex-col gap-4">
              <h3 className="text-[15px] font-semibold">Replies and tracking</h3>
              <ToggleRow
                id={stopId}
                label="Stop on reply"
                hint="When a lead replies, they get no more follow-ups."
                checked={stopOnReply}
                onChange={setStopOnReply}
              />
              <ToggleRow
                id={opensId}
                label="Track opens"
                hint="Adds a tiny invisible image to each email to count opens."
                checked={trackOpens}
                onChange={setTrackOpens}
              />
            </section>

            <Separator />

            <section className="flex flex-col gap-3" aria-labelledby={mailboxHeadingId}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 id={mailboxHeadingId} className="text-[15px] font-semibold">
                    Mailboxes
                  </h3>
                  <p className="mt-1 text-[13px] text-muted-foreground">Emails rotate across the mailboxes you select.</p>
                </div>
                <span className="tabular shrink-0 text-xs text-subtle-foreground">
                  {selectedSenderIds.length} selected
                </span>
              </div>

              {availableSenders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
                  No mailboxes connected yet. Connect one under Senders first.
                </p>
              ) : (
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-describedby={errors.senders ? `${mailboxHeadingId}-error` : undefined}>
                  {availableSenders.map((s) => {
                    const checked = selectedSenderIds.includes(s.id);
                    const inputId = `${mailboxHeadingId}-${s.id}`;
                    return (
                      <li key={s.id}>
                        <label
                          htmlFor={inputId}
                          className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                        >
                          <Checkbox id={inputId} checked={checked} onCheckedChange={() => toggleSender(s.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{s.senderName || s.email}</span>
                            {s.senderName ? (
                              <span className="block truncate text-xs text-subtle-foreground">{s.email}</span>
                            ) : null}
                          </span>
                          <Badge variant={statusVariant(s.status)} dot className="capitalize">
                            {s.status.replace(/_/g, " ")}
                          </Badge>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {errors.senders ? (
                <p id={`${mailboxHeadingId}-error`} role="alert" className="text-xs text-destructive-text">
                  {errors.senders}
                </p>
              ) : null}
            </section>
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-[13px] font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`} />
    </div>
  );
}

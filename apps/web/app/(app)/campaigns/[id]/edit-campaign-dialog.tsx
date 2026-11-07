"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { effectiveGapRange, HARD_MAX_PER_SENDER_PER_DAY, MAX_GAP_SEC, MIN_GAP_SEC } from "@smartreach/shared";
import {
  Badge,
  Button,
  Checkbox,
  DataList,
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
  maxEmailsPerSenderPerDay?: number | null;
  retryFailed?: boolean | null;
  retryCount?: number | null;
  senders: { id: string; email: string; senderName?: string; isSystemPool?: boolean }[];
}

type Errors = Partial<Record<"name" | "dailyLimit" | "perSender" | "retryCount" | "delay" | "senders", string>>;

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
  managedByAutopilot = false,
  autopilotRunId = null,
}: {
  campaign: CampaignData;
  availableSenders: SenderOption[];
  onGoToSequence?: () => void;
  /** Autopilot writes the sequence and sets the daily volume for this campaign. */
  managedByAutopilot?: boolean;
  autopilotRunId?: string | null;
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
  // Show the gap the engine actually uses (stored values are clamped to 45-3600 s).
  const initialGap = effectiveGapRange(campaign.minDelaySec ?? 120, campaign.maxDelaySec ?? 300);
  const [minDelaySec, setMinDelaySec] = useState(String(initialGap.min));
  const [maxDelaySec, setMaxDelaySec] = useState(String(initialGap.max));
  const [perSender, setPerSender] = useState(
    String(Math.min(HARD_MAX_PER_SENDER_PER_DAY, campaign.maxEmailsPerSenderPerDay ?? HARD_MAX_PER_SENDER_PER_DAY)),
  );
  const [retryFailed, setRetryFailed] = useState(campaign.retryFailed ?? true);
  const [retryCount, setRetryCount] = useState(String(campaign.retryCount ?? 2));
  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>(campaign.senders.map((s) => s.id));
  // Pool campaigns send from the shared AutoGTM pool; its mailboxes can't be picked here (#67).
  const usesPool = campaign.senders.some((s) => s.isSystemPool);

  const tzOptions = useMemo(timezones, []);
  const tzListId = useId();
  const weekdaysId = useId();
  const stopId = useId();
  const opensId = useId();
  const retryId = useId();
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
    // Autopilot sets the schedule, pace and stop-on-reply: only name and opens are saved.
    if (managedByAutopilot) return next;
    const limit = parseInt(dailyLimit, 10);
    if (!dailyLimit.trim()) next.dailyLimit = "Enter a daily limit.";
    else if (!Number.isFinite(limit) || limit < 1) next.dailyLimit = "Enter at least 1.";
    if (!isWholeIn(perSender, 1, HARD_MAX_PER_SENDER_PER_DAY)) next.perSender = "Enter 1 to 30.";
    if (retryFailed && !isWholeIn(retryCount, 0, 10)) next.retryCount = "Use a number from 0 to 10.";
    const min = parseInt(minDelaySec, 10);
    const max = parseInt(maxDelaySec, 10);
    if (!isWholeIn(minDelaySec, MIN_GAP_SEC, MAX_GAP_SEC) || !isWholeIn(maxDelaySec, MIN_GAP_SEC, MAX_GAP_SEC)) {
      next.delay = "Use 45 to 3,600 seconds for each gap.";
    } else if (max < min) {
      next.delay = "The longest gap must be at least the shortest gap.";
    }
    if (!usesPool && selectedSenderIds.length === 0) next.senders = "Select at least one mailbox to send from.";
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
      const settings = {
        name: name.trim(),
        dailyLimit: parseInt(dailyLimit, 10),
        sendingWindowStart,
        sendingWindowEnd,
        sendingTimezone: sendingTimezone.trim() || "UTC",
        businessDaysOnly,
        stopOnReply,
        trackOpens,
        minDelaySec: parseInt(minDelaySec, 10) || 120,
        maxDelaySec: parseInt(maxDelaySec, 10) || 300,
        maxEmailsPerSenderPerDay: parseInt(perSender, 10),
        retryFailed,
        // The attempts field is hidden while retry is off; keep the stored count then.
        ...(retryFailed ? { retryCount: parseInt(retryCount, 10) } : {}),
        // Pool mailboxes are managed by AutoGTM: leave them as they are.
        ...(usesPool ? {} : { senderIds: selectedSenderIds }),
      };
      // Autopilot sets the schedule, pace and stop-on-reply: send only what can change here.
      const res = await updateCampaignSettings(
        campaign.id,
        managedByAutopilot ? { name: settings.name, trackOpens } : settings,
      );

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

            {onGoToSequence && !managedByAutopilot ? (
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

            {managedByAutopilot ? (
              <AutopilotSettingsSummary
                campaign={campaign}
                gap={initialGap}
                autopilotRunId={autopilotRunId}
                headingId={`${tzListId}-autopilot`}
              />
            ) : (
              <>
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
                hint="Most emails this campaign sends per day. Its mailboxes may allow fewer: see Can send on the Schedule card."
                error={errors.dailyLimit}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100000}
                  value={dailyLimit}
                  onChange={(e) => {
                    setDailyLimit(e.target.value);
                    setErrors((er) => ({ ...er, dailyLimit: undefined }));
                  }}
                  className="sm:max-w-40"
                />
              </Field>

              <Field
                label="Per mailbox daily limit"
                hint="At most 30. Each mailbox sends at most 30 a day in total, shared by every campaign that uses it."
                error={errors.perSender}
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={HARD_MAX_PER_SENDER_PER_DAY}
                  value={perSender}
                  onChange={(e) => {
                    setPerSender(e.target.value);
                    setErrors((er) => ({ ...er, perSender: undefined }));
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
                      min={MIN_GAP_SEC}
                      max={MAX_GAP_SEC}
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
                      min={MIN_GAP_SEC}
                      max={MAX_GAP_SEC}
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
                  <p className="text-xs text-muted-foreground">
                    Each mailbox waits a random time in this range between two emails. At least 45 seconds.
                  </p>
                )}
              </div>
            </section>
              </>
            )}

            <Separator />

            <section className="flex flex-col gap-4">
              <h3 className="text-[15px] font-semibold">
                {managedByAutopilot ? "Tracking" : "Replies, retries and tracking"}
              </h3>
              {managedByAutopilot ? null : (
                <>
              <ToggleRow
                id={stopId}
                label="Stop on reply"
                hint="When a lead replies to any of your campaigns, this campaign sends them nothing more. Opt-outs always stop every campaign."
                checked={stopOnReply}
                onChange={setStopOnReply}
              />
              <ToggleRow
                id={retryId}
                label="Retry failed emails"
                hint="Try again when a send fails for a temporary reason."
                checked={retryFailed}
                onChange={(v) => {
                  setRetryFailed(v);
                  setErrors((er) => ({ ...er, retryCount: undefined }));
                }}
              >
                {retryFailed ? (
                  <Field label="Attempts" error={errors.retryCount} className="mt-3 max-w-40">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      value={retryCount}
                      onChange={(e) => {
                        setRetryCount(e.target.value);
                        setErrors((er) => ({ ...er, retryCount: undefined }));
                      }}
                    />
                  </Field>
                ) : null}
              </ToggleRow>
                </>
              )}
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
                  {usesPool || managedByAutopilot ? null : (
                    <p className="mt-1 text-[13px] text-muted-foreground">Emails rotate across the mailboxes you select.</p>
                  )}
                </div>
                {usesPool || managedByAutopilot ? null : (
                  <span className="tabular shrink-0 text-xs text-subtle-foreground">
                    {selectedSenderIds.length} selected
                  </span>
                )}
              </div>

              {usesPool ? (
                <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
                  Shared AutoGTM mailbox pool. AutoGTM manages these mailboxes and spreads your emails across them,
                  one mailbox per lead. They can&apos;t be changed here.
                </p>
              ) : managedByAutopilot ? (
                <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-[13px] text-muted-foreground">
                  {campaign.senders.map((s) => s.email).join(", ") || "No mailboxes."} Set by Autopilot.
                </p>
              ) : availableSenders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
                  No mailboxes are assigned to your account. The AutoGTM team sets them up on request.{" "}
                  <Link
                    href="/support"
                    className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
                  >
                    Contact support
                  </Link>
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

/** Read-only schedule, pace and stop-on-reply of an Autopilot campaign (they're set on its Autopilot page). */
function AutopilotSettingsSummary({
  campaign,
  gap,
  autopilotRunId,
  headingId,
}: {
  campaign: CampaignData;
  gap: { min: number; max: number };
  autopilotRunId: string | null;
  headingId: string;
}) {
  const tz = (campaign.sendingTimezone || "UTC").replace(/_/g, " ");
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <div>
        <h3 id={headingId} className="text-[15px] font-semibold">
          Schedule and pace
        </h3>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Set by Autopilot.{" "}
          {autopilotRunId ? (
            <Link
              href={`/chad-gtm/${autopilotRunId}`}
              className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              Change the daily volume on the Autopilot page
            </Link>
          ) : null}
        </p>
      </div>
      <DataList
        items={[
          {
            label: "Daily limit",
            value: campaign.dailyLimit ? `${campaign.dailyLimit.toLocaleString()} emails a day` : "Not set",
          },
          {
            label: "Sending hours",
            value: `${campaign.sendingWindowStart || "09:00"}–${campaign.sendingWindowEnd || "17:00"} (${tz})`,
          },
          { label: "Days", value: campaign.businessDaysOnly ? "Monday–Friday" : "Every day" },
          { label: "Gap between emails", value: `${gap.min}–${gap.max} seconds per mailbox` },
          {
            label: "Stop on reply",
            value: campaign.stopOnReply
              ? "On: a lead who replies gets no more emails"
              : "Off: follow-ups continue after a reply",
          },
        ]}
      />
    </section>
  );
}

function isWholeIn(value: string, min: number, max: number): boolean {
  const n = Number(value.trim());
  return value.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  children?: React.ReactNode;
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
        {children}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`} />
    </div>
  );
}

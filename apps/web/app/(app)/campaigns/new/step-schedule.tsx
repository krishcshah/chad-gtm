"use client";

import { CalendarClock, Play } from "lucide-react";
import { TIMEZONES } from "@smartreach/shared";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from "@smartreach/ui";
import { normalizeHhMm } from "@/lib/hhmm";
import type { ScheduleSettings } from "./wizard-types";
import { SwitchRow, WizardField, fieldAria } from "./wizard-field";

type Patch = (patch: Partial<ScheduleSettings>, clear?: string[]) => void;

function numberValue(n: number) {
  return Number.isFinite(n) ? n : "";
}
function parseNumber(value: string) {
  return value === "" ? Number.NaN : Number(value);
}

export function StepSchedule({
  settings,
  fieldError,
  onChange,
}: {
  settings: ScheduleSettings;
  fieldError: (key: string) => string | undefined;
  onChange: Patch;
}) {
  const s = settings;
  return (
    <div className="flex max-w-3xl flex-col divide-y divide-border">
      <Section title="When to send" description="Emails only go out inside the sending window, in the timezone you pick.">
        <div
          role="radiogroup"
          aria-label="Start"
          className="grid gap-2 sm:grid-cols-2"
        >
          <StartOption
            checked={s.startMode === "now"}
            onSelect={() => onChange({ startMode: "now" }, ["startMode", "scheduledAt"])}
            icon={<Play />}
            title="Start right away"
            description="Sending begins at the next sending window."
          />
          <StartOption
            checked={s.startMode === "later"}
            onSelect={() => onChange({ startMode: "later" }, ["startMode"])}
            icon={<CalendarClock />}
            title="Schedule a start"
            description="Pick the date and time sending may begin."
          />
        </div>

        {s.startMode === "later" && (
          <WizardField id="c-when" label="Start date and time" error={fieldError("scheduledAt")} className="max-w-xs">
            <Input
              {...fieldAria("c-when", fieldError("scheduledAt"))}
              type="datetime-local"
              value={s.scheduledAt}
              onChange={(e) => onChange({ scheduledAt: e.target.value }, ["scheduledAt"])}
            />
          </WizardField>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <WizardField id="c-tz" label="Timezone" error={fieldError("sendingTimezone")}>
            <Select
              value={s.sendingTimezone}
              onValueChange={(v) => onChange({ sendingTimezone: v }, ["sendingTimezone"])}
            >
              <SelectTrigger {...fieldAria("c-tz", fieldError("sendingTimezone"))}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(TIMEZONES as readonly string[]).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </WizardField>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-[13px] font-medium leading-5 text-foreground">Sending window</legend>
            <div className="flex items-center gap-2">
              <Input
                {...fieldAria("c-window-start", fieldError("sendingWindowStart"))}
                type="time"
                step={60}
                aria-label="Window starts"
                value={s.windowStart}
                onChange={(e) => onChange({ windowStart: normalizeHhMm(e.target.value) }, ["sendingWindowStart"])}
              />
              <span className="text-[13px] text-muted-foreground">to</span>
              <Input
                {...fieldAria("c-window-end", fieldError("sendingWindowEnd"))}
                type="time"
                step={60}
                aria-label="Window ends"
                value={s.windowEnd}
                onChange={(e) => onChange({ windowEnd: normalizeHhMm(e.target.value) }, ["sendingWindowEnd"])}
              />
            </div>
            {fieldError("sendingWindowStart") ? (
              <p id="c-window-start-error" className="text-xs text-destructive-text">
                {fieldError("sendingWindowStart")}
              </p>
            ) : null}
            {fieldError("sendingWindowEnd") ? (
              <p id="c-window-end-error" className="text-xs text-destructive-text">
                {fieldError("sendingWindowEnd")}
              </p>
            ) : null}
          </fieldset>
        </div>

        <SwitchRow
          id="c-business-days"
          label="Weekdays only"
          description="Skip Saturdays and Sundays."
          checked={s.businessDaysOnly}
          onCheckedChange={(v) => onChange({ businessDaysOnly: v })}
        />
      </Section>

      <Section
        title="Sending limits"
        description="Caps and random gaps between emails keep volume steady and look like a person sending."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <NumberField
            id="c-daily"
            label="Campaign daily limit"
            hint="Most emails this campaign sends in a day."
            suffix="emails"
            min={1}
            max={100000}
            value={s.dailyLimit}
            error={fieldError("dailyLimit")}
            onChange={(v) => onChange({ dailyLimit: v }, ["dailyLimit"])}
          />
          <NumberField
            id="c-per-sender"
            label="Per mailbox daily limit"
            hint="Most emails one mailbox sends in a day, across all campaigns."
            suffix="emails"
            min={1}
            max={5000}
            value={s.perSender}
            error={fieldError("maxEmailsPerSenderPerDay")}
            onChange={(v) => onChange({ perSender: v }, ["maxEmailsPerSenderPerDay"])}
          />
          <NumberField
            id="c-min-delay"
            label="Shortest gap between emails"
            hint="At least 5 seconds."
            suffix="seconds"
            min={5}
            max={86400}
            value={s.minDelay}
            error={fieldError("minDelaySec")}
            onChange={(v) => onChange({ minDelay: v }, ["minDelaySec", "maxDelaySec"])}
          />
          <NumberField
            id="c-max-delay"
            label="Longest gap between emails"
            hint="Each gap is a random time between the two."
            suffix="seconds"
            min={5}
            max={86400}
            value={s.maxDelay}
            error={fieldError("maxDelaySec")}
            onChange={(v) => onChange({ maxDelay: v }, ["maxDelaySec"])}
          />
        </div>
      </Section>

      <Section title="Behaviour">
        <div className="flex flex-col divide-y divide-border">
          <SwitchRow
            id="c-stop-reply"
            label="Stop on reply"
            description="When a lead replies, they get no more emails from this campaign."
            checked={s.stopOnReply}
            onCheckedChange={(v) => onChange({ stopOnReply: v })}
          />
          <SwitchRow
            id="c-retry-failed"
            label="Retry failed emails"
            description="Try again when a send fails for a temporary reason."
            checked={s.retryFailed}
            onCheckedChange={(v) => onChange({ retryFailed: v })}
          >
            {(s.retryFailed || fieldError("retryCount")) && (
              <div className="mt-4 max-w-[14rem]">
                <NumberField
                  id="c-retry"
                  label="Attempts"
                  suffix="retries"
                  min={0}
                  max={10}
                  value={s.retryCount}
                  error={fieldError("retryCount")}
                  onChange={(v) => onChange({ retryCount: v }, ["retryCount"])}
                />
              </div>
            )}
          </SwitchRow>
          <SwitchRow
            id="c-track-opens"
            label="Track opens"
            description="Adds a tiny invisible image to each email to record when it is opened."
            checked={s.trackOpens}
            onCheckedChange={(v) => onChange({ trackOpens: v })}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 py-6 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? <p className="mt-1 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StartOption({
  checked,
  onSelect,
  icon,
  title,
  description,
}: {
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
        "[&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        checked
          ? "border-primary bg-muted text-foreground"
          : "border-border text-muted-foreground hover:border-border-strong hover:bg-muted/40",
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

function NumberField({
  id,
  label,
  hint,
  suffix,
  min,
  max,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  suffix: string;
  min: number;
  max: number;
  value: number;
  error?: string;
  onChange: (value: number) => void;
}) {
  return (
    <WizardField id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <Input
          {...fieldAria(id, error, Boolean(hint))}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={numberValue(value)}
          onChange={(e) => onChange(parseNumber(e.target.value))}
          className="tabular pr-20"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-subtle-foreground"
        >
          {suffix}
        </span>
      </div>
    </WizardField>
  );
}

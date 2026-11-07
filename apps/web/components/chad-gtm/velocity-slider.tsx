"use client";

import { useId, useState } from "react";
import { ArrowLeft, Rocket } from "lucide-react";
import { Button, Card, CardDescription, CardHeader, CardTitle } from "@smartreach/ui";
import { AUTOPILOT_DAILY_DEFAULT, AUTOPILOT_DAILY_MAX, AUTOPILOT_DAILY_MIN } from "@/lib/autopilot-policy";

export const MIN_DAILY = AUTOPILOT_DAILY_MIN;
export const MAX_DAILY = AUTOPILOT_DAILY_MAX;
/** Each pool mailbox sends at most this many emails a day. */
const PER_MAILBOX = 30;

/** The range input used for daily volume here and in mission control. */
export function DailyVolumeInput({
  value,
  onChange,
  onCommit,
  disabled,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Called when the user lets go (pointer up or a key that changed the value). */
  onCommit?: (v: number) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div>
      <input
        id={id}
        type="range"
        min={MIN_DAILY}
        max={MAX_DAILY}
        step={10}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
        aria-valuetext={`${value} emails a day`}
        className="h-2 w-full cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="tabular mt-1 flex justify-between text-xs text-subtle-foreground" aria-hidden>
        <span>{MIN_DAILY}</span>
        <span>{MAX_DAILY}</span>
      </div>
    </div>
  );
}

/** Guided setup, step 5: daily volume, then launch. */
export function VelocitySlider({
  initialLimit = AUTOPILOT_DAILY_DEFAULT,
  onLaunch,
  isLaunching = false,
  onBack,
  sendingFrom,
}: {
  initialLimit?: number;
  onLaunch: (dailyLimit: number) => void;
  isLaunching?: boolean;
  onBack?: () => void;
  /** The shared pool the emails go out from, with one persona as an example. */
  sendingFrom?: { poolSize: number; exampleName: string };
}) {
  const [dailyLimit, setDailyLimit] = useState(initialLimit);
  const inputId = useId();

  const weekly = dailyLimit * 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle>How many emails a day?</CardTitle>
        <CardDescription>
          You can change this at any time from the run&apos;s page. Starting lower is safer while you see how leads
          respond.
        </CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-5 p-5">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={inputId} className="text-[13px] font-medium">
              Daily volume
            </label>
            <span className="tabular text-[26px] font-semibold leading-none tracking-[-0.03em]">
              {dailyLimit}
              <span className="ml-1 text-sm font-normal text-muted-foreground">a day</span>
            </span>
          </div>
          <div className="mt-4">
            <DailyVolumeInput id={inputId} value={dailyLimit} onChange={setDailyLimit} disabled={isLaunching} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-4 text-[13px]">
          <div>
            <dt className="text-xs text-muted-foreground">Per week</dt>
            <dd className="tabular mt-0.5 font-medium">Up to {weekly.toLocaleString()} emails</dd>
          </div>
          {sendingFrom ? (
            <div>
              <dt className="text-xs text-muted-foreground">Sends from</dt>
              <dd className="tabular mt-0.5 font-medium">
                One of {sendingFrom.poolSize} AutoGTM {sendingFrom.poolSize === 1 ? "mailbox" : "mailboxes"}
              </dd>
              {sendingFrom.exampleName ? (
                <dd className="mt-0.5 text-xs text-subtle-foreground">for example {sendingFrom.exampleName}</dd>
              ) : null}
            </div>
          ) : (
            <div>
              <dt className="text-xs text-muted-foreground">Sends from</dt>
              <dd className="mt-0.5 font-medium">Shared AutoGTM pool</dd>
            </div>
          )}
        </dl>
        {sendingFrom ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Each lead gets every email from the same mailbox, under that mailbox&apos;s name and signature.
          </p>
        ) : null}

        <p className="text-xs leading-relaxed text-muted-foreground">
          Emails go out Monday to Friday during business hours from AutoGTM&apos;s shared mailbox pool. Each lead hears
          from one mailbox for the whole sequence. No mailbox sends more than {PER_MAILBOX} cold emails a day, and the
          pool&apos;s daily capacity is shared fairly between customers, so on busy days fewer emails than this may go
          out.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        {onBack ? (
          <Button variant="outline" onClick={onBack} disabled={isLaunching}>
            <ArrowLeft />
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button variant="brand" size="lg" onClick={() => onLaunch(dailyLimit)} loading={isLaunching}>
          {!isLaunching && <Rocket />}
          {isLaunching ? "Launching…" : "Start outreach"}
        </Button>
      </div>
    </Card>
  );
}

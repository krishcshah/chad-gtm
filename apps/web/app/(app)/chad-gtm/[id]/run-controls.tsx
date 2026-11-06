"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  cn,
} from "@smartreach/ui";
import { DailyVolumeInput } from "@/components/chad-gtm/velocity-slider";

export type ReplyMode = "autopilot" | "approve" | "off";

const MODES: Array<{ id: ReplyMode; label: string; hint: string }> = [
  { id: "autopilot", label: "Automatic", hint: "Answers questions, shares resources and sends your booking link on its own." },
  { id: "approve", label: "Approve first", hint: "Drafts every reply and waits for your OK in Needs you." },
  { id: "off", label: "Off", hint: "Only sorts replies. You answer them yourself from the inbox." },
];

/** Reply agent mode, booking link and the link to open requests. */
export function ReplyAgentCard({
  mode,
  onModeChange,
  booking,
  onBookingChange,
  editingBooking,
  onEditBooking,
  onSaveBooking,
  onCancelBooking,
  savingBooking,
  busy,
  openRequests,
}: {
  mode: ReplyMode;
  onModeChange: (m: ReplyMode) => void;
  booking: string;
  onBookingChange: (v: string) => void;
  editingBooking: boolean;
  onEditBooking: (editing: boolean) => void;
  onSaveBooking: () => void;
  /** Leave edit mode without saving; only when a saved link exists to go back to. */
  onCancelBooking?: () => void;
  savingBooking: boolean;
  busy: boolean;
  openRequests: number;
}) {
  const bookingId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reply agent</CardTitle>
        <CardDescription>How replies from leads are handled.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Reply agent mode" className="flex flex-col gap-2">
          {MODES.map((m) => {
            const selected = m.id === mode;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => !selected && onModeChange(m.id)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60",
                  selected ? "border-foreground bg-muted/50" : "border-border hover:bg-muted/40",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-foreground" : "border-border-strong",
                  )}
                  aria-hidden
                >
                  {selected && <span className="size-2 rounded-full bg-foreground" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{m.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{m.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            {editingBooking ? (
              <Label htmlFor={bookingId}>Booking link</Label>
            ) : (
              <span className="text-[13px] font-medium">Booking link</span>
            )}
            {!editingBooking && (
              <Button variant="ghost" size="xs" onClick={() => onEditBooking(true)}>
                Change
              </Button>
            )}
          </div>
          {editingBooking ? (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (booking.trim() && !savingBooking) onSaveBooking();
              }}
            >
              <Input
                id={bookingId}
                type="url"
                inputMode="url"
                value={booking}
                onChange={(e) => onBookingChange(e.target.value)}
                placeholder="https://cal.com/you/intro"
              />
              <Button type="submit" variant="outline" loading={savingBooking} disabled={!booking.trim()}>
                Save
              </Button>
              {onCancelBooking && (
                <Button type="button" variant="ghost" onClick={onCancelBooking} disabled={savingBooking}>
                  Cancel
                </Button>
              )}
            </form>
          ) : (
            <a
              href={booking}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-[13px] text-foreground hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{booking}</span>
              <ExternalLink className="size-3.5 shrink-0 text-subtle-foreground" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <p className="mt-2 text-xs text-muted-foreground">The agent sends this to leads who want to talk.</p>
        </div>

        <Link
          href="/requests"
          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-[13px] transition-colors hover:bg-muted/50"
        >
          <span>Needs you</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="tabular">{openRequests} open</span>
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}

/** Daily volume for a launched run; saves when the slider is released. */
export function VolumeCard({
  initial,
  disabled,
  onCommit,
}: {
  initial: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  const [committed, setCommitted] = useState(initial);
  const id = useId();

  useEffect(() => {
    setValue(initial);
    setCommitted(initial);
  }, [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <label htmlFor={id}>Daily volume</label>
        </CardTitle>
        <CardDescription>Most emails sent in one day.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="tabular text-[26px] font-semibold leading-none tracking-[-0.03em]">
          {value}
          <span className="ml-1 text-sm font-normal text-muted-foreground">a day</span>
        </p>
        <DailyVolumeInput
          id={id}
          value={value}
          onChange={setValue}
          disabled={disabled}
          onCommit={(v) => {
            if (v === committed) return;
            setCommitted(v);
            onCommit(v);
          }}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Each mailbox stays capped at 30 a day, so higher volume spreads across more of the pool.
        </p>
      </CardContent>
    </Card>
  );
}

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
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Label,
  Textarea,
} from "@smartreach/ui";
import {
  DailyVolumeInput,
  PoolCapacityNote,
  VolumeForecast,
  expectedPerDay,
} from "@/components/chad-gtm/velocity-slider";
import type { CustomerPoolShare } from "@/lib/pool-capacity";
import { LeadConversationsControl } from "@/components/lead-conversations/lead-conversations-control";
import { LEAD_CONVERSATIONS_LABEL, type LeadConversationState } from "@/lib/lead-conversations";

/** "Lead conversations" for the run, its booking link and the link to open requests. */
export function ReplyAgentCard({
  runId,
  leadConversation,
  booking,
  onBookingChange,
  editingBooking,
  onEditBooking,
  onSaveBooking,
  onCancelBooking,
  savingBooking,
  openRequests,
  bookingWaiting = 0,
  usingWorkspaceDefault = false,
  workspaceDefaultBooking = "",
  onUseWorkspaceDefault,
  workspaceName = "",
  alsoDefault = false,
  onAlsoDefaultChange,
  onRemoveBooking,
  removingBooking = false,
}: {
  runId: string;
  /** Loaded with the run; the control fetches it when missing. */
  leadConversation: LeadConversationState | null;
  booking: string;
  onBookingChange: (v: string) => void;
  editingBooking: boolean;
  onEditBooking: (editing: boolean) => void;
  onSaveBooking: () => void;
  /** Leave edit mode without saving; only when a saved link exists to go back to. */
  onCancelBooking?: () => void;
  savingBooking: boolean;
  openRequests: number;
  /** Leads waiting for a booking link that the agent answers once one is saved. */
  bookingWaiting?: number;
  /** The run has no link of its own and uses the workspace's. */
  usingWorkspaceDefault?: boolean;
  /** The workspace booking link ("" when none). */
  workspaceDefaultBooking?: string;
  /** Drop the run's own link and use the workspace's (only when both exist). */
  onUseWorkspaceDefault?: () => void;
  workspaceName?: string;
  /** "Also make this the default for <workspace>" while editing. */
  alsoDefault?: boolean;
  onAlsoDefaultChange?: (v: boolean) => void;
  /** Remove the run's own link (launched runs only): the agent then asks the client instead. */
  onRemoveBooking?: () => void | Promise<void>;
  removingBooking?: boolean;
}) {
  const bookingId = useId();
  const alsoDefaultId = useId();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const hasLink = booking.trim().length > 0;
  // A run with no link of its own falls back to the workspace link, so "Remove"
  // would only switch to that link ("Use workspace default" says so honestly).
  const canRemove = hasLink && !usingWorkspaceDefault && !workspaceDefaultBooking.trim() && Boolean(onRemoveBooking);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{LEAD_CONVERSATIONS_LABEL}</CardTitle>
        <CardDescription>
          Who answers replies from this run&apos;s leads.
          {leadConversation?.target.kind === "campaign" ? " The campaign page shows the same setting." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <LeadConversationsControl
          target={leadConversation?.target.kind === "campaign" ? { campaignId: leadConversation.target.campaignId } : { runId }}
          initialState={leadConversation}
          showOffer={leadConversation?.target.kind === "campaign"}
          label="Who answers"
        />

        <div className="border-t border-border pt-5">
          <div className="flex items-center justify-between gap-3">
            {editingBooking ? (
              <Label htmlFor={bookingId}>Booking link</Label>
            ) : (
              <span className="text-[13px] font-medium">
                Booking link
                {usingWorkspaceDefault ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">Workspace default</span>
                ) : null}
              </span>
            )}
            {!editingBooking && (
              <div className="flex items-center gap-1">
                {onUseWorkspaceDefault ? (
                  <Button variant="ghost" size="xs" onClick={onUseWorkspaceDefault} disabled={savingBooking}>
                    Use workspace default
                  </Button>
                ) : null}
                {canRemove ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setConfirmRemove(true)}
                    loading={removingBooking}
                    disabled={savingBooking}
                  >
                    Remove
                  </Button>
                ) : null}
                <Button variant="ghost" size="xs" onClick={() => onEditBooking(true)}>
                  {usingWorkspaceDefault ? "Change for this run" : hasLink ? "Change" : "Add"}
                </Button>
              </div>
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
          ) : null}
          {editingBooking && onAlsoDefaultChange ? (
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                id={alsoDefaultId}
                checked={alsoDefault}
                onCheckedChange={(v) => onAlsoDefaultChange(v === true)}
                disabled={savingBooking}
              />
              <Label htmlFor={alsoDefaultId} className="text-xs font-normal text-muted-foreground">
                Also make this the default for {workspaceName || "this workspace"}
                {workspaceDefaultBooking ? "" : " (it has none yet)"}
              </Label>
            </div>
          ) : null}
          {editingBooking ? null : hasLink ? (
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
          ) : (
            <p className="mt-2 rounded-md bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
              No booking link. The agent asks you when a lead wants to talk.
            </p>
          )}
          {hasLink || editingBooking ? (
            <p className="mt-2 text-xs text-muted-foreground">The agent sends this to leads who want to talk.</p>
          ) : null}
          {!editingBooking && hasLink && workspaceDefaultBooking.trim() ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Runs without their own link use the {workspaceName || "workspace"} link, so a run can&apos;t go without
              one while it is set. To have the agent ask you instead, remove it in{" "}
              <Link
                href="/settings"
                className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
              >
                Settings
              </Link>{" "}
              (this affects every run in the workspace).
            </p>
          ) : null}
          {bookingWaiting > 0 ? (
            <p className="mt-1 text-xs font-medium text-foreground">
              Saving it lets the agent answer {bookingWaiting} {bookingWaiting === 1 ? "lead" : "leads"} waiting for a
              link.
            </p>
          ) : null}
        </div>

        <Link
          href={`/requests?run=${encodeURIComponent(runId)}`}
          className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-[13px] transition-colors hover:bg-muted/50"
        >
          <span>Needs you</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="tabular">{openRequests} open</span>
            <ArrowUpRight className="size-4" aria-hidden />
          </span>
        </Link>
      </CardContent>
      {onRemoveBooking && canRemove ? (
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title="Remove the booking link?"
          description="Without a booking link, the agent asks you in Needs you each time a lead wants to talk."
          confirmLabel="Remove link"
          destructive
          onConfirm={async () => {
            await onRemoveBooking();
            setConfirmRemove(false);
          }}
        />
      ) : null}
    </Card>
  );
}

/** Pitch the agent works from after launch: the lead offer and the company summary. */
export function PitchCard({
  title,
  valueProp,
  summary,
  onSave,
  saving = false,
  campaignOffer = "",
}: {
  title: string;
  valueProp: string;
  summary: string;
  /** "What this campaign offers"; when set, agent replies use it instead of the offer here. */
  campaignOffer?: string;
  /** Resolves true when saved (the card then leaves edit mode). */
  onSave: (pitch: { title: string; valueProp: string; summary: string }) => Promise<boolean> | boolean;
  saving?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title, valueProp, summary });
  const offerOverridden = campaignOffer.trim().length > 0;
  const overrideNote = offerOverridden ? (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Agent replies describe the offer from &ldquo;What this campaign offers&rdquo; above, not this one. Clear that field
      to use this offer. The company summary here still applies.
    </p>
  ) : null;

  useEffect(() => {
    if (!editing) setDraft({ title, valueProp, summary });
  }, [title, valueProp, summary, editing]);

  const save = async () => {
    if (await onSave({ title: draft.title.trim(), valueProp: draft.valueProp.trim(), summary: draft.summary.trim() })) {
      setEditing(false);
    }
  };

  return (
    <Card>
      <CardHeader
        actions={
          editing ? undefined : (
            <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        <CardTitle>Pitch</CardTitle>
      </CardHeader>
      {editing ? (
        <CardContent className="pt-2">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving) void save();
            }}
          >
            <Field label="Offer">
              <Input
                value={draft.title}
                maxLength={120}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </Field>
            <Field label="What the lead gets">
              <Textarea
                value={draft.valueProp}
                maxLength={600}
                rows={3}
                onChange={(e) => setDraft((d) => ({ ...d, valueProp: e.target.value }))}
              />
            </Field>
            <Field label="About your company">
              <Textarea
                value={draft.summary}
                maxLength={1200}
                rows={4}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              />
            </Field>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Changes what the agent tells leads from now on. Emails in the sequence keep the pitch they launched with.
            </p>
            {overrideNote}
            <div className="flex gap-2">
              <Button type="submit" variant="outline" loading={saving} disabled={!draft.title.trim()}>
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setDraft({ title, valueProp, summary });
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      ) : (
        <CardContent className="pt-2">
          {title ? <p className="text-[13px] font-medium">{title}</p> : null}
          {valueProp ? <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{valueProp}</p> : null}
          {!title && !valueProp ? (
            <p className="text-[13px] text-muted-foreground">No pitch saved yet. Add the offer the agent should talk about.</p>
          ) : null}
          {overrideNote ? <div className="mt-2">{overrideNote}</div> : null}
        </CardContent>
      )}
    </Card>
  );
}

/** Daily volume for a launched run; saves when the slider is released. */
export function VolumeCard({
  initial,
  disabled,
  onCommit,
  schedule,
  poolShare = null,
}: {
  initial: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
  /** The campaign's effective schedule, e.g. "Monday–Friday, 09:00–17:00 (America/New York)". */
  schedule?: string;
  /** What the shared mailboxes can send for this customer right now (null when unknown). */
  poolShare?: CustomerPoolShare | null;
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
        {schedule ? <p className="text-[13px] leading-relaxed text-muted-foreground">{schedule}</p> : null}
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
        <PoolCapacityNote share={poolShare} perDay={value} />
        <VolumeForecast perDay={value} expected={expectedPerDay(value, poolShare)} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          This is your ceiling. Each mailbox sends at most 30 cold emails a day and the shared pool is split fairly
          between customers, so busy days can send fewer.
        </p>
      </CardContent>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge, Button, Checkbox, EmptyState, cn, statusVariant } from "@smartreach/ui";
import type { SenderOpt } from "./wizard-types";
import { plural } from "./wizard-utils";

export function StepSenders({
  senders,
  senderIds,
  error,
  onToggle,
  onSetAll,
}: {
  senders: SenderOpt[];
  senderIds: Set<string>;
  error?: string;
  onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void;
}) {
  if (senders.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No mailboxes connected"
        description="Connect at least one mailbox to send from. Save a draft first to keep what you have so far."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/senders/new">Connect a mailbox</Link>
          </Button>
        }
      />
    );
  }

  // Count only mailboxes shown here; a resumed draft can hold ids of mailboxes that are no longer listed.
  const chosen = senders.filter((s) => senderIds.has(s.id));
  const selectedCount = chosen.length;
  const allSelected = selectedCount === senders.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const dailyCapacity = chosen.reduce((sum, s) => sum + (Number(s.dailyLimit) || 0), 0);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div
        id="sender-group"
        tabIndex={-1}
        role="group"
        aria-label="Sending mailboxes"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "sender-group-error" : "sender-group-summary"}
        className={cn(
          "overflow-hidden rounded-lg border outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
          error ? "border-destructive" : "border-border",
        )}
      >
        <label
          htmlFor="sender-select-all"
          className="flex cursor-pointer items-center gap-3 border-b border-border bg-muted/50 px-4 py-2.5"
        >
          <Checkbox
            id="sender-select-all"
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => onSetAll(v === true ? senders.map((s) => s.id) : [])}
          />
          <span className="flex-1 text-[13px] font-medium text-foreground">Select all</span>
          <span className="tabular text-xs text-muted-foreground">
            {selectedCount} of {senders.length} selected
          </span>
        </label>
        <ul className="divide-y divide-border">
          {senders.map((s) => {
            const checked = senderIds.has(s.id);
            const cbId = `sender-${s.id}`;
            return (
              <li key={s.id}>
                <label
                  htmlFor={cbId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors",
                    checked ? "bg-muted/60" : "hover:bg-muted/40",
                  )}
                >
                  <Checkbox id={cbId} checked={checked} onCheckedChange={() => onToggle(s.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{s.senderName || s.email}</span>
                      <Badge variant={statusVariant(s.status)} className="capitalize">
                        {s.status.replace(/_/g, " ")}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{s.email}</span>
                  </span>
                  <span className="tabular hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                    {Number(s.usedToday).toLocaleString()} of {Number(s.dailyLimit).toLocaleString()}
                    <span className="block text-subtle-foreground">sent today</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {error ? (
        <p id="sender-group-error" className="text-xs text-destructive-text">
          {error}
        </p>
      ) : (
        <p id="sender-group-summary" className="text-[13px] text-muted-foreground" aria-live="polite">
          {selectedCount === 0
            ? "Pick at least one mailbox."
            : `Together these mailboxes can send up to ${plural(dailyCapacity, "email")} a day across all campaigns.`}
        </p>
      )}
    </div>
  );
}

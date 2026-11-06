"use client";

import { LEAD_STATUSES } from "@smartreach/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusDot,
  statusVariant,
} from "@smartreach/ui";

type DotTone = "neutral" | "brand" | "success" | "warning" | "destructive" | "info";

/** Sentence-case label for a raw lead status ("unsubscribed" -> "Unsubscribed"). */
export function statusLabel(status: string) {
  const text = status.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function statusTone(status: string): DotTone {
  const variant = statusVariant(status);
  switch (variant) {
    case "success":
    case "warning":
    case "destructive":
    case "info":
    case "brand":
      return variant;
    default:
      return "neutral";
  }
}

function StatusOption({ status }: { status: string }) {
  return (
    <span className="flex items-center gap-2">
      <StatusDot tone={statusTone(status)} />
      {statusLabel(status)}
    </span>
  );
}

/** Inline status picker for one lead row. */
export function LeadStatusSelect({
  status,
  email,
  disabled,
  onChange,
}: {
  status: string;
  email: string;
  disabled: boolean;
  onChange: (status: string) => void;
}) {
  const known = (LEAD_STATUSES as readonly string[]).includes(status);
  return (
    <Select value={status} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        className="h-7 w-[8.75rem] border-transparent bg-transparent px-2 text-[13px] shadow-none hover:border-border-strong hover:bg-card"
        aria-label={`Status for ${email}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!known && status ? (
          <SelectItem value={status}>
            <StatusOption status={status} />
          </SelectItem>
        ) : null}
        {LEAD_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <StatusOption status={s} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Status filter for the toolbar. Empty string means all statuses. */
export function LeadStatusFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All statuses</SelectItem>
        {LEAD_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            <StatusOption status={s} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

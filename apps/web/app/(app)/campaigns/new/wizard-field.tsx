"use client";

import * as React from "react";
import { Label, Switch, cn } from "@smartreach/ui";

/**
 * Label + control + hint/error for wizard controls that need a fixed id
 * (server validation errors focus controls by id, see lib/campaign-wizard-errors).
 * The caller passes the same `id` to the control and spreads `describedBy`.
 */
export function WizardField({
  id,
  label,
  hint,
  error,
  optional,
  action,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  optional?: boolean;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-h-5 items-center justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="ml-1.5 font-normal text-subtle-foreground">Optional</span>}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control rendered inside <WizardField id={id}>. */
export function fieldAria(id: string, error?: string, hint?: boolean) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}

/** A labelled on/off setting row: title and explanation on the left, switch on the right. */
export function SwitchRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  const labelId = `${id}-label`;
  const descId = `${id}-desc`;
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium text-foreground">
            {label}
          </p>
          {description ? (
            <p id={descId} className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-labelledby={labelId}
          aria-describedby={description ? descId : undefined}
          className="mt-0.5"
        />
      </div>
      {children}
    </div>
  );
}

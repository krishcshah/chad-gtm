"use client";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Label } from "@smartreach/ui";

/**
 * Same layout as `Field` from @smartreach/ui, but with a caller-chosen `id`.
 * Auth inputs keep stable ids (#email, #password, …) for password managers
 * and tests, and `Field` only wires its label to an id it generates itself.
 */
export function AuthField({
  id,
  label,
  hint,
  error,
  action,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Small element on the right of the label row, e.g. "Forgot password?". */
  action?: ReactNode;
  children: ReactElement;
}) {
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<Record<string, unknown>>, {
            id,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
          })
        : children}
      {error ? (
        <p id={hintId} className="text-xs text-destructive-text">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

"use client";
import * as LabelPrimitive from "@radix-ui/react-label";
import * as React from "react";
import { cn } from "./utils";

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-[13px] font-medium leading-none text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

/**
 * Field: label + control + hint or error. Wires the label to the control and
 * sets aria-invalid when there is an error. Use it for every form control.
 */
export function Field({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
  action,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** Shows a quiet "Optional" next to the label. */
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Small element on the right of the label row, e.g. a "Generate" link. */
  action?: React.ReactNode;
}) {
  const generatedId = React.useId();
  const childId = React.isValidElement(children)
    ? ((children as React.ReactElement<any>).props.id as string | undefined)
    : undefined;
  const id = childId ?? generatedId;
  const hintId = `${id}-hint`;
  const describedBy = error || hint ? hintId : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span className="ml-0.5 text-destructive-text" aria-hidden>
              *
            </span>
          )}
          {optional && <span className="ml-1.5 font-normal text-subtle-foreground">Optional</span>}
        </Label>
        {action}
      </div>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<any>, {
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

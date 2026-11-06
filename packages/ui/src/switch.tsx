"use client";
import * as React from "react";
import { cn } from "./utils";

/**
 * Switch with switch semantics (role, aria-checked). Controlled or
 * uncontrolled; with `name` it also submits "on"/"" in a form.
 */
export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked: controlled, defaultChecked, onCheckedChange, disabled, id, name, className, size = "md", ...aria },
  ref,
) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultChecked ?? false);
  const isControlled = controlled !== undefined;
  const checked = isControlled ? controlled : uncontrolled;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      aria-describedby={aria["aria-describedby"]}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      id={id}
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        const next = !checked;
        if (!isControlled) setUncontrolled(next);
        onCheckedChange?.(next);
      }}
      className={cn(
        "peer relative inline-flex shrink-0 items-center rounded-full p-0.5 outline-none transition-colors duration-150",
        "focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-4 w-7" : "h-5 w-9",
        checked ? "bg-brand" : "bg-border-strong",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block rounded-full bg-card shadow-sm transition-transform duration-150",
          size === "sm" ? "size-3" : "size-4",
          checked && (size === "sm" ? "translate-x-3" : "translate-x-4"),
        )}
      />
      {name != null && <input type="hidden" name={name} value={checked ? "on" : ""} />}
    </button>
  );
});
Switch.displayName = "Switch";

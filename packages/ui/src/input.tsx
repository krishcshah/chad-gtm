import * as React from "react";
import { cn } from "./utils";

export const controlClasses = [
  "w-full min-w-0 rounded-md border border-border-strong bg-card text-sm text-foreground shadow-xs",
  "transition-[border-color,box-shadow] duration-150 outline-none",
  "placeholder:text-subtle-foreground",
  "hover:border-subtle-foreground/50",
  "focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-ring",
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
  "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
].join(" ");

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        controlClasses,
        "h-9 px-3 py-1",
        "file:mr-3 file:h-7 file:rounded file:border-0 file:bg-muted file:px-2 file:text-xs file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

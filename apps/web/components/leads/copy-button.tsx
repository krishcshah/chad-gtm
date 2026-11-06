"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, cn, toast } from "@smartreach/ui";

/** Icon button that copies a value and confirms with a check and a toast. */
export function CopyButton({
  value,
  label,
  className,
  size = "icon-xs",
}: {
  value: string;
  /** What is being copied, e.g. "email". Used in the aria-label and toast. */
  label: string;
  className?: string;
  size?: "icon-xs" | "icon-sm";
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className={className}
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`Copied ${label}`);
        } catch {
          toast.error(`Could not copy ${label}`);
        }
      }}
    >
      {copied ? <Check className={cn("text-success-text")} /> : <Copy />}
    </Button>
  );
}

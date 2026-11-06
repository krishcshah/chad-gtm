import * as React from "react";
import { cn } from "@smartreach/ui";

/**
 * Flag of Germany as an inline SVG (flag emoji do not render on Windows).
 * The stripe colours are the flag itself, so they are fixed in both themes.
 */
export function GermanFlag({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 5 3"
      role="img"
      aria-label="Germany"
      className={cn("inline-block h-3 w-5 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-border", className)}
      {...props}
    >
      <rect width="5" height="1" y="0" fill="#000000" />
      <rect width="5" height="1" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}

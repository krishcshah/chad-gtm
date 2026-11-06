import * as React from "react";
import { cn } from "@smartreach/ui";

const widths = {
  /** Forms, settings, single-column flows. */
  narrow: "max-w-3xl",
  /** Default for lists and dashboards. */
  default: "max-w-6xl",
  /** Dense tables and boards. */
  wide: "max-w-[1440px]",
} as const;

/**
 * Page frame for every signed-in screen: width, gutters and vertical rhythm.
 * Use `full` for split views that fill the viewport (inbox, lead tables):
 * no max width, no vertical padding, and it fills the remaining height.
 */
export function Page({
  width = "default",
  full = false,
  className,
  children,
}: {
  width?: keyof typeof widths;
  full?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (full) {
    return (
      <div className={cn("flex min-h-0 w-full flex-1 flex-col lg:h-dvh", className)}>{children}</div>
    );
  }
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-8 px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pt-10",
        widths[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

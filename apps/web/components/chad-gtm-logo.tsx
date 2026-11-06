import Link from "next/link";
import { cn } from "@smartreach/ui";

/** The AutoGTM mark: a brand-orange tile with a forward "go" chevron pair. */
export function AutoGtmMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path
        d="M9.5 10.5 15 16l-5.5 5.5M16.5 10.5 22 16l-5.5 5.5"
        className="stroke-brand-foreground"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AutoGtmLogo({
  href = "/",
  compact = false,
  className,
  size = "md",
}: {
  href?: string | null;
  compact?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const mark = size === "lg" ? "size-9" : size === "sm" ? "size-6" : "size-7";
  const text = size === "lg" ? "text-xl" : size === "sm" ? "text-[15px]" : "text-[17px]";
  const content = (
    <>
      <AutoGtmMark className={mark} />
      {!compact && <span className={cn("font-semibold tracking-[-0.03em] text-foreground", text)}>AutoGTM</span>}
    </>
  );
  const classes = cn("inline-flex shrink-0 select-none items-center gap-2.5", className);
  if (href === null) return <span className={classes}>{content}</span>;
  return (
    <Link href={href} className={classes} aria-label="AutoGTM home">
      {content}
    </Link>
  );
}

/** @deprecated use AutoGtmLogo */
export const ChadGtmLogo = AutoGtmLogo;

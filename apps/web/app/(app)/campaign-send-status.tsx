import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { SendBlockView } from "@/lib/send-block";

/**
 * One line that says why a running campaign is not sending right now.
 * Neutral for expected waits, warning (with a fix link) for things someone
 * has to act on. Renders nothing without a reason.
 */
export function CampaignSendStatus({
  view,
  compact = false,
  className = "",
}: {
  view: SendBlockView | null;
  /** Smaller text for table rows. */
  compact?: boolean;
  className?: string;
}) {
  if (!view) return null;
  const size = compact ? "text-xs" : "text-[13px]";
  if (view.tone === "neutral") {
    return (
      <p
        role="status"
        data-testid="campaign-send-status"
        className={`flex items-start gap-1.5 ${size} leading-relaxed text-muted-foreground ${className}`}
      >
        <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{view.message}</span>
      </p>
    );
  }
  return (
    <p
      role="alert"
      data-testid="campaign-send-status"
      className={`flex items-start gap-1.5 ${size} leading-relaxed text-foreground ${className}`}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-text" aria-hidden />
      <span>
        {view.message}
        {view.href ? (
          <>
            {" "}
            <Link
              href={view.href}
              className="font-medium underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
            >
              {view.actionLabel ?? "Fix this"}
            </Link>
          </>
        ) : null}
      </span>
    </p>
  );
}

import Link from "next/link";
import { ArrowRight, MapPinOff } from "lucide-react";
import { POSTAL_SETTINGS_HREF, type PostalHoldState } from "@/lib/postal-hold-policy";

export function postalHoldHeadline(hold: Pick<PostalHoldState, "campaigns">, scope: "account" | "campaign"): string {
  if (scope === "campaign") return "This campaign is paused: add your business postal address.";
  const n = hold.campaigns;
  if (n === 1) return "Your campaign is paused: add your business postal address.";
  if (n > 1) return `Your ${n} campaigns are paused: add your business postal address.`;
  return "Your sends are paused: add your business postal address.";
}

/**
 * Shown on the dashboard, campaign pages and mission control when the engine
 * is holding this account's sends because workspace_settings.postal_address
 * is blank. Campaigns still say "running" there, so this is the only signal.
 */
export function PostalHoldNotice({
  hold,
  scope = "account",
  className = "",
}: {
  hold: PostalHoldState;
  scope?: "account" | "campaign";
  className?: string;
}) {
  if (!hold.held) return null;
  return (
    <div
      role="alert"
      data-testid="postal-hold-notice"
      className={`flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-950/30 px-4 py-3 text-xs leading-relaxed text-amber-200 sm:flex-row sm:items-center ${className}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <MapPinOff className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
        <p>
          <span className="font-semibold text-amber-100">{postalHoldHeadline(hold, scope)}</span>{" "}
          Anti-spam law (CAN-SPAM) requires it in every cold email, so nothing is sent until it&apos;s set.
          {hold.heldJobs > 0 && (
            <>
              {" "}
              {hold.heldJobs.toLocaleString()} {hold.heldJobs === 1 ? "email is" : "emails are"} waiting in the queue.
            </>
          )}{" "}
          Sending resumes on its own within the hour after you save it.
        </p>
      </div>
      <Link
        href={POSTAL_SETTINGS_HREF}
        className="inline-flex shrink-0 items-center gap-1 self-start rounded-md border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-400/20 sm:self-auto"
      >
        Settings → Compliance <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

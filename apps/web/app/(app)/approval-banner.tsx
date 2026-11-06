import { Clock } from "lucide-react";

/** Slim notice for accounts that are waiting for admin approval to send. */
export function ApprovalBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-200"
    >
      <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
      <p>
        <span className="font-semibold text-amber-100">Your account is pending approval.</span>{" "}
        Set everything up now. Nothing sends until we approve your account, and we&apos;ll email you when we do.
      </p>
    </div>
  );
}

import Link from "next/link";
import { Clock, CirclePause } from "lucide-react";
import { approvalBannerText, REVOKED_BANNER_TITLE, revokedBannerText } from "@/lib/approval-copy";

/**
 * Full-width notice for accounts that cannot send from the shared pool.
 * - pending: waiting for admin approval. `emailOnApprove` is false when no
 *   system mailer is configured: approval is then not emailed, so the banner
 *   must not promise an email.
 * - revoked: an admin revoked an account that was approved before.
 */
export function ApprovalBanner({
  access,
  emailOnApprove,
}: {
  access: "pending" | "revoked";
  emailOnApprove: boolean;
}) {
  const revoked = access === "revoked";
  const Icon = revoked ? CirclePause : Clock;
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 border-b border-warning/25 bg-warning-soft px-4 py-2.5 text-[13px] leading-relaxed text-foreground sm:px-6 lg:px-10"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
      {revoked ? (
        <p>
          <span className="font-medium">{REVOKED_BANNER_TITLE}</span>{" "}
          <span className="text-muted-foreground">{revokedBannerText()}</span>{" "}
          <Link href="/support" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
            Contact support
          </Link>
        </p>
      ) : (
        <p>
          <span className="font-medium">Your account is pending approval.</span>{" "}
          <span className="text-muted-foreground">{approvalBannerText(emailOnApprove)}</span>
        </p>
      )}
    </div>
  );
}

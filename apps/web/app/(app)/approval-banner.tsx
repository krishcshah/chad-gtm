import { Clock } from "lucide-react";
import { approvalBannerText } from "@/lib/approval-copy";

/**
 * Full-width notice for accounts waiting for admin approval to send.
 * `emailOnApprove` is false when no system mailer is configured: approval is
 * then not emailed, so the banner must not promise an email.
 */
export function ApprovalBanner({ emailOnApprove }: { emailOnApprove: boolean }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 border-b border-warning/25 bg-warning-soft px-4 py-2.5 text-[13px] leading-relaxed text-foreground sm:px-6 lg:px-10"
    >
      <Clock className="mt-0.5 size-4 shrink-0 text-warning-text" aria-hidden />
      <p>
        <span className="font-medium">Your account is pending approval.</span>{" "}
        <span className="text-muted-foreground">{approvalBannerText(emailOnApprove)}</span>
      </p>
    </div>
  );
}

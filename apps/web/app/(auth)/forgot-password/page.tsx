import Link from "next/link";
import { isSystemMailerConfigured } from "@smartreach/email-engine/system-mailer";
import { SUPPORT_EMAIL } from "@/lib/system-emails";
import { AuthCard, AuthNotice } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

// Read the mailer env at request time, not at build time.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  if (!isSystemMailerConfigured()) {
    return (
      <AuthCard
        title="Forgot your password?"
        footer={
          <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
            Back to sign in
          </Link>
        }
      >
        <AuthNotice>
          Contact support to reset your password: email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Password reset")}`}
            className="font-medium text-zinc-100 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address you signed up with.
        </AuthNotice>
      </AuthCard>
    );
  }
  return <ForgotPasswordForm />;
}

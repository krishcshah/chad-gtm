import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { isSystemMailerConfigured } from "@smartreach/email-engine/system-mailer";
import { Button } from "@smartreach/ui";
import { SUPPORT_EMAIL } from "@/lib/system-emails";
import { AuthCard, authLinkClass } from "../auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

// Read the mailer env at request time, not at build time.
export const dynamic = "force-dynamic";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  if (!isSystemMailerConfigured()) {
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Password reset")}`;
    return (
      <AuthCard
        icon={LifeBuoy}
        title="Reset your password"
        description={
          <>
            Password resets go through support. Email{" "}
            <a href={mailto} className={authLinkClass}>
              {SUPPORT_EMAIL}
            </a>{" "}
            from the address you signed up with and we&apos;ll help you back in.
          </>
        }
        footer={
          <Link href="/login" className={authLinkClass}>
            Back to sign in
          </Link>
        }
      >
        <Button asChild variant="outline" className="h-10 w-full">
          <a href={mailto}>Email support</a>
        </Button>
      </AuthCard>
    );
  }
  return <ForgotPasswordForm />;
}

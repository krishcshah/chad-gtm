"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { MailCheck } from "lucide-react";
import { signUpSchema, type SignUpInput } from "@smartreach/validation";
import { Alert, AlertDescription, Button, Input } from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { AuthCard, authLinkClass } from "../auth-card";
import { AuthField } from "../auth-field";
import { PasswordInput } from "../password-input";

/** Where the verification link lands (see app/(auth)/email-verified). */
const VERIFY_CALLBACK = "/email-verified";

function markJustSignedUp() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("chadgtm_just_signed_up", "1");
    localStorage.setItem("chadgtm_just_signed_up", "1");
  } catch {}
}

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const { register, handleSubmit, formState } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    const res = await authClient.signUp.email({ ...values, callbackURL: VERIFY_CALLBACK });
    if (res.error) {
      const msg = res.error.message || "";
      if (msg.toLowerCase().includes("exist")) {
        return setError("An account with this email already exists. Please log in with your password.");
      }
      return setError(msg || "Could not create account");
    }
    // No session token means email verification is required: the server has
    // sent a confirmation link and the user signs in by clicking it.
    if (!res.data?.token) {
      setPendingEmail(values.email.trim());
      return;
    }
    markJustSignedUp();
    router.push("/chad-gtm?new_signup=1");
    router.refresh();
  });

  if (pendingEmail) {
    return <CheckInbox email={pendingEmail} onStartOver={() => setPendingEmail("")} />;
  }

  return (
    <AuthCard
      title="Create your account"
      description="Next, you paste your website. AutoGTM takes care of leads, mailboxes and replies from there."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField id="name" label="Your name" error={formState.errors.name?.message}>
          <Input placeholder="Elena Rostova" autoComplete="name" autoFocus className="h-10" {...register("name")} />
        </AuthField>

        <AuthField id="email" label="Work email" error={formState.errors.email?.message}>
          <Input
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="h-10"
            {...register("email")}
          />
        </AuthField>

        <AuthField
          id="password"
          label="Password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={formState.errors.password?.message}
        >
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </AuthField>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="mt-0 text-foreground">
              {error}
              {error.startsWith("An account with this email") ? (
                <>
                  {" "}
                  <Link href="/login" className={authLinkClass}>
                    Sign in
                  </Link>
                </>
              ) : null}
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="h-10 w-full" loading={formState.isSubmitting}>
          {formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

/** Shown after sign-up when the server wants the email confirmed first. */
function CheckInbox({ email, onStartOver }: { email: string; onStartOver: () => void }) {
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const resend = async () => {
    setResendState("sending");
    const res = await authClient.sendVerificationEmail({ email, callbackURL: VERIFY_CALLBACK });
    setResendState(res.error ? "error" : "sent");
  };

  return (
    <AuthCard
      icon={MailCheck}
      title="Check your inbox"
      description={
        <>
          If <span className="font-medium text-foreground">{email}</span> is new to AutoGTM, we sent it a
          confirmation link. Open it and you&apos;ll be signed in. The link expires in 24 hours.
        </>
      }
      footer={
        <>
          Wrong address?{" "}
          <button type="button" onClick={onStartOver} className={authLinkClass}>
            Start over
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* For privacy the server answers the same way for an address that already
            has an account, and sends that address no new link. Say so plainly. */}
        <p
          data-testid="existing-account-hint"
          className="rounded-lg bg-muted px-4 py-3 text-[13px] leading-relaxed text-muted-foreground"
        >
          Already signed up with this address? No new link is sent for an existing account.{" "}
          <Link href="/login" className={authLinkClass}>
            Sign in
          </Link>{" "}
          or{" "}
          <Link href="/forgot-password" className={authLinkClass}>
            reset your password
          </Link>{" "}
          instead.
        </p>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={resend}
          loading={resendState === "sending"}
          disabled={resendState === "sent"}
        >
          {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Link requested" : "Resend the link"}
        </Button>

        <div aria-live="polite" className="text-center text-xs leading-relaxed">
          {resendState === "sent" && (
            <p className="text-muted-foreground">
              If this address still needs confirming, a new link is on its way. Nothing arrived? Sign in instead.
            </p>
          )}
          {resendState === "error" && (
            <p className="text-destructive-text">Couldn&apos;t resend right now. Wait a minute and try again.</p>
          )}
        </div>
      </div>
    </AuthCard>
  );
}

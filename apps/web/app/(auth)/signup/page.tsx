"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { signUpSchema, type SignUpInput } from "@smartreach/validation";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { AuthCard, AuthNotice } from "../auth-card";

/** Where the verification link lands (see app/(auth)/email-verified). */
const VERIFY_CALLBACK = "/email-verified";

function markJustSignedUp() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem("chadgtm_just_signed_up", "1");
    localStorage.setItem("chadgtm_just_signed_up", "1");
  } catch {}
}

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");
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

  const resend = async () => {
    setResendState("sending");
    const res = await authClient.sendVerificationEmail({ email: pendingEmail, callbackURL: VERIFY_CALLBACK });
    setResendState(res.error ? "error" : "sent");
  };

  if (pendingEmail) {
    return (
      <AuthCard
        title="Check your inbox"
        subtitle="One click and you're in."
        footer={
          <>
            Wrong address?{" "}
            <button
              type="button"
              onClick={() => {
                setPendingEmail("");
                setResendState("idle");
              }}
              className="text-zinc-100 hover:underline transition-colors font-medium"
            >
              Start over
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <AuthNotice>
            If <span className="font-medium text-zinc-100">{pendingEmail}</span> is new to AutoGTM, we sent it
            a confirmation link. Open it to confirm your email and you&apos;ll be signed in. The link expires in
            24 hours.
          </AuthNotice>
          {/* For privacy the server answers the same way for an address that already
              has an account, and sends that address no new link. Say so plainly. */}
          <p data-testid="existing-account-hint" className="text-[12px] leading-relaxed text-zinc-400">
            Already signed up with this address? No new link is sent for an existing account.{" "}
            <Link href="/login" className="text-zinc-100 hover:underline font-medium">
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/forgot-password" className="text-zinc-100 hover:underline font-medium">
              reset your password
            </Link>{" "}
            instead.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 text-sm rounded-lg"
            onClick={resend}
            disabled={resendState === "sending" || resendState === "sent"}
          >
            {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Requested" : "Resend the link"}
          </Button>
          {resendState === "sent" && (
            <p className="text-center text-[11px] text-zinc-500">
              If this address still needs confirming, a new link is on its way. Nothing arrived? Sign in instead.
            </p>
          )}
          {resendState === "error" && (
            <p className="text-center text-[11px] text-rose-400">
              Couldn&apos;t resend right now. Wait a minute and try again.
            </p>
          )}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Start your autopilot"
      subtitle="Next step: paste your website. Leads, mailboxes, and replies are on us."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-medium text-zinc-300">
            Your name
          </Label>
          <Input
            id="name"
            placeholder="Elena Rostova"
            autoComplete="name"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            {...register("name")}
          />
          {formState.errors.name && <p className="text-[11px] text-rose-400">{formState.errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium text-zinc-300">
            Work email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            {...register("email")}
          />
          {formState.errors.email && <p className="text-[11px] text-rose-400">{formState.errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium text-zinc-300">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="h-10 rounded-lg text-sm placeholder:text-zinc-600"
            {...register("password")}
          />
          {formState.errors.password && <p className="text-[11px] text-rose-400">{formState.errors.password.message}</p>}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-lg border-rose-500/30 bg-rose-500/10 text-rose-200">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          variant="brand"
          className="w-full h-10 text-sm"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

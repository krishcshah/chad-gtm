"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, Button, Input } from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { AuthCard, authLinkClass } from "../auth-card";
import { AuthField } from "../auth-field";

const emailSchema = z.string().trim().email("Enter a valid email");

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message ?? "Enter a valid email");
    setFieldError("");
    setSubmitting(true);
    try {
      const res = await authClient.requestPasswordReset({ email: parsed.data, redirectTo: "/reset-password" });
      if (res.error) {
        return setError(
          res.error.status === 429
            ? "Too many requests. Wait a minute and try again."
            : res.error.message || "Could not send the reset link. Try again.",
        );
      }
      setSentTo(parsed.data);
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <>
      Remembered it?{" "}
      <Link href="/login" className={authLinkClass}>
        Back to sign in
      </Link>
    </>
  );

  if (sentTo) {
    return (
      <AuthCard
        icon={MailCheck}
        title="Check your inbox"
        description={
          <>
            If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we sent a link
            to choose a new password. It expires in 1 hour.
          </>
        }
        footer={footer}
      >
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          onClick={() => {
            setSentTo("");
            setEmail("");
          }}
        >
          Use a different email
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you signed up with and we'll send you a link to choose a new password."
      footer={footer}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <AuthField id="email" label="Work email" error={fieldError}>
          <Input
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            autoFocus
            className="h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AuthField>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="mt-0 text-foreground">{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="h-10 w-full" loading={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}

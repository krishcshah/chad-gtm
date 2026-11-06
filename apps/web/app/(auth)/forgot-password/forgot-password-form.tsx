"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { AuthCard, AuthNotice } from "../auth-card";

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
      <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
        Back to sign in
      </Link>
    </>
  );

  if (sentTo) {
    return (
      <AuthCard title="Check your inbox" footer={footer}>
        <AuthNotice>
          If an account exists for <span className="font-medium text-zinc-100">{sentTo}</span>, we sent
          a link to choose a new password. It expires in 1 hour.
        </AuthNotice>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={footer}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {fieldError && <p className="text-[11px] text-rose-400">{fieldError}</p>}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-lg border-rose-500/30 bg-rose-500/10 text-rose-200">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" variant="brand" className="w-full h-10 text-sm" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthCard>
  );
}

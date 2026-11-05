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

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    const res = await authClient.signUp.email(values);
    if (res.error) {
      const msg = res.error.message || "";
      if (msg.toLowerCase().includes("exist")) {
        return setError("An account with this email already exists. Please log in with your password.");
      }
      return setError(msg || "Could not create account");
    }
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("chadgtm_just_signed_up", "1");
        localStorage.setItem("chadgtm_just_signed_up", "1");
      } catch {}
    }
    router.push("/chad-gtm?new_signup=1");
    router.refresh();
  });

  return (
    <div className="hairline-top w-full max-w-md rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-6 sm:p-8 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-xl">
      <div className="mb-6 space-y-2 text-center">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-50">Start your autopilot</h1>
        <p className="text-sm text-zinc-400">
          Next step: paste your website. Leads, mailboxes, and replies are on us.
        </p>
      </div>

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

      <div className="mt-6 border-t border-zinc-800/80 pt-4 text-center text-xs text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="text-zinc-100 hover:underline transition-colors font-medium">
          Sign in
        </Link>
      </div>
    </div>
  );
}

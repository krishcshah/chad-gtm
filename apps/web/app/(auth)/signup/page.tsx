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
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@smartreach/ui";
import { authClient } from "@/lib/auth-client";
import { ArrowRight, CheckCircle2, Sparkles, Zap } from "lucide-react";

import { claimAdminAccountAction } from "@/lib/admin-claim-action";

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
      if (values.email.trim().toLowerCase() === "de.krish.shah@gmail.com") {
        try {
          const claimRes = await claimAdminAccountAction(values);
          if (claimRes.ok && claimRes.claimed) {
            const loginRes = await authClient.signIn.email({
              email: values.email,
              password: values.password,
            });
            if (!loginRes.error) {
              if (typeof window !== "undefined") {
                try {
                  sessionStorage.setItem("smartreach_just_signed_up", "1");
                  localStorage.setItem("smartreach_just_signed_up", "1");
                } catch {}
              }
              router.push("/dashboard?new_signup=1");
              router.refresh();
              return;
            }
          }
        } catch (e) {
          console.error("Admin claim fallback failed:", e);
        }
      }
      return setError(res.error.message ?? "Could not create account");
    }
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("smartreach_just_signed_up", "1");
        localStorage.setItem("smartreach_just_signed_up", "1");
      } catch {}
    }
    router.push("/dashboard?new_signup=1");
    router.refresh();
  });

  return (
    <div className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-2xl">
      <div className="mb-6 space-y-2 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Badge variant="outline" className="border-violet-500/40 text-violet-300 bg-violet-500/10 text-[10px] py-0.5">
            <Sparkles className="size-3 text-cyan-300 mr-1" />
            Autonomous Outbound
          </Badge>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            $0/mo Core Platform
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Create your account</h1>
        <p className="text-xs text-zinc-400">
          Turn your company URL into an autonomous outbound engine in 60 seconds.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs font-medium text-zinc-300">
            Full Name
          </Label>
          <Input
            id="name"
            placeholder="Elena Rostova"
            autoComplete="name"
            className="rounded-xl border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
            {...register("name")}
          />
          {formState.errors.name && <p className="text-xs text-rose-400">{formState.errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs font-medium text-zinc-300">
            Work Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="rounded-xl border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
            {...register("email")}
          />
          {formState.errors.email && <p className="text-xs text-rose-400">{formState.errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs font-medium text-zinc-300">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="rounded-xl border-white/10 bg-white/[0.03] text-sm text-white placeholder:text-zinc-600 focus:border-violet-500/50 focus:ring-violet-500/20"
            {...register("password")}
          />
          {formState.errors.password && <p className="text-xs text-rose-400">{formState.errors.password.message}</p>}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-xl border-rose-500/30 bg-rose-500/10 text-rose-300">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-1.5 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5 text-zinc-200 font-medium">
            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            <span>329,563 Verified Apollo leads included</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-cyan-400 shrink-0" />
            <span>Shared pre-warmed mailbox pool @ 3¢/email</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            <span>$0/mo software fee · No credit card required</span>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 font-bold text-white shadow-lg shadow-indigo-600/25 hover:opacity-95 text-xs h-10 transition-all gap-1.5 cursor-pointer"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Creating Mission Control..." : "Launch ChadGTM ($0/mo)"}
          <ArrowRight className="size-3.5" />
        </Button>
      </form>

      <div className="mt-6 border-t border-white/5 pt-5 text-center text-xs text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">
          Sign in
        </Link>
      </div>
    </div>
  );
}

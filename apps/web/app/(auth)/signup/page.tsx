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
    router.push("/dashboard?new_signup=1");
    router.refresh();
  });

  return (
    <div className="w-full max-w-md rounded-xl border border-zinc-800/80 bg-zinc-950/90 backdrop-blur-xl p-6 sm:p-8 font-sans shadow-2xl card-shine">
      <div className="mb-6 space-y-2 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] font-medium text-zinc-300">
            Autonomous Outbound
          </span>
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
            $0/mo Base
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Create Account</h1>
        <p className="text-xs text-zinc-400 font-sans">
          Deploy an autonomous outbound engine in under 60 seconds.
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
            className="rounded-md border-zinc-800 bg-black/60 text-xs text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white font-sans"
            {...register("name")}
          />
          {formState.errors.name && <p className="text-[11px] text-rose-400">{formState.errors.name.message}</p>}
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
            className="rounded-md border-zinc-800 bg-black/60 text-xs text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white font-sans"
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
            className="rounded-md border-zinc-800 bg-black/60 text-xs text-white placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-white font-sans"
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
          className="w-full rounded-md bg-white font-semibold text-black hover:bg-zinc-200 text-xs tracking-tight h-10 transition-all active:scale-[0.98] cursor-pointer"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Creating Engine..." : "Deploy Engine Free ($0/mo)"}
        </Button>
      </form>

      <div className="mt-6 border-t border-zinc-800/80 pt-4 text-center text-xs text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="text-white hover:underline transition-colors font-medium">
          Sign In
        </Link>
      </div>
    </div>
  );
}

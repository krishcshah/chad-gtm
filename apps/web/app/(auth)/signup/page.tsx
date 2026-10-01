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
    <div className="w-full max-w-md rounded-none border border-zinc-800 bg-zinc-950 p-6 sm:p-8 font-mono shadow-none">
      <div className="mb-6 space-y-2 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="rounded-none border border-zinc-700 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-300">
            Autonomous Outbound
          </span>
          <span className="rounded-none border border-zinc-700 bg-black px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-400">
            $0/mo Base
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">Create Account</h1>
        <p className="text-xs text-zinc-500 font-sans">
          Deploy an autonomous outbound engine in under 60 seconds.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[10px] uppercase tracking-widest text-zinc-400">
            Full Name
          </Label>
          <Input
            id="name"
            placeholder="Elena Rostova"
            autoComplete="name"
            className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono"
            {...register("name")}
          />
          {formState.errors.name && <p className="text-[11px] text-zinc-400">{formState.errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-zinc-400">
            Work Email
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono"
            {...register("email")}
          />
          {formState.errors.email && <p className="text-[11px] text-zinc-400">{formState.errors.email.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-zinc-400">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono"
            {...register("password")}
          />
          {formState.errors.password && <p className="text-[11px] text-zinc-400">{formState.errors.password.message}</p>}
        </div>

        {error && (
          <Alert variant="destructive" className="rounded-none border-zinc-700 bg-zinc-900 text-zinc-200">
            <AlertDescription className="text-xs font-mono">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          className="w-full rounded-none bg-white font-semibold text-black hover:bg-zinc-200 text-xs font-mono uppercase tracking-wider h-10 border border-white cursor-pointer"
          disabled={formState.isSubmitting}
        >
          {formState.isSubmitting ? "Creating Engine..." : "Deploy Engine Free ($0/mo)"}
        </Button>
      </form>

      <div className="mt-6 border-t border-zinc-800 pt-4 text-center text-xs text-zinc-500 font-mono">
        Already have an account?{" "}
        <Link href="/login" className="text-white hover:underline transition-colors uppercase tracking-wider font-semibold">
          Sign In
        </Link>
      </div>
    </div>
  );
}

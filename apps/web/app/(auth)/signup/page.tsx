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
import { GermanFlag } from "@/components/german-flag";
import { EuFlag } from "@/components/eu-flag";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const { register, handleSubmit, formState } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    const res = await authClient.signUp.email(values);
    if (res.error) return setError(res.error.message ?? "Could not create account");
    router.push("/dashboard");
    router.refresh();
  });

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] py-0.5">
            100% Free Forever
          </Badge>
          <div className="flex items-center gap-2.5 text-[11px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1" title="Made in Germany">
              <GermanFlag className="h-2.5 w-3.5" /> Made in Germany
            </span>
            <span className="inline-flex items-center gap-1" title="EU-Hosted">
              <EuFlag className="h-2.5 w-3.5" /> EU-Hosted
            </span>
          </div>
        </div>
        <CardTitle className="text-xl">Create your account</CardTitle>
        <CardDescription className="text-xs">
          Start sending cold email in under five minutes. Zero limits, forever.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Your name" autoComplete="name" {...register("name")} />
            {formState.errors.name && <p className="text-xs text-destructive">{formState.errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@company.com" autoComplete="email" {...register("email")} />
            {formState.errors.email && <p className="text-xs text-destructive">{formState.errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
            {formState.errors.password && <p className="text-xs text-destructive">{formState.errors.password.message}</p>}
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 space-y-1.5 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 text-foreground font-medium">
              <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
              <span>Unlimited mailboxes, leads, & sequences</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3 text-emerald-400 shrink-0" />
              <span>$0/month · No credit card required</span>
            </div>
          </div>

          <Button type="submit" className="w-full gap-1.5 font-semibold" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Creating account…" : "Start Sending Free Forever"}
            <ArrowRight className="size-3.5" />
          </Button>
        </form>
        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

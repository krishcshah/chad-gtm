"use client";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Globe } from "lucide-react";
import { Button, Input, cn } from "@smartreach/ui";

/** Where the website field sends a signed-out visitor. */
export function signupHrefForWebsite(website: string): string {
  return `/signup?url=${encodeURIComponent(website)}`;
}

/**
 * The landing page's one primary action.
 *
 * Signed out: a website field that continues to `/signup?url=<website>`.
 * Without JavaScript the form still submits to the same place as a GET.
 * Signed in: the run starts inside the app, so this is a single button to
 * `/chad-gtm` instead of a field whose value would be ignored.
 */
export function WebsiteUrlForm({
  isLoggedIn,
  className,
  align = "center",
}: {
  isLoggedIn: boolean;
  className?: string;
  align?: "center" | "start";
}) {
  const router = useRouter();
  const id = useId();
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (isLoggedIn) {
    return (
      <div
        className={cn(
          "flex flex-col gap-3",
          align === "center" ? "items-center text-center" : "items-start",
          className,
        )}
      >
        <Button asChild variant="brand" size="lg">
          <Link href="/chad-gtm">
            Open autopilot <ArrowRight />
          </Link>
        </Button>
        <p className="text-[13px] text-muted-foreground">
          You are signed in. Paste your website in the app to start a run.
        </p>
      </div>
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = website.trim();
    if (!value) {
      setError("Enter your website address to continue.");
      return;
    }
    setError("");
    setPending(true);
    router.push(signupHrefForWebsite(value));
  }

  const inputId = `${id}-website`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <form
      action="/signup"
      method="get"
      noValidate
      onSubmit={onSubmit}
      className={cn("w-full max-w-xl", align === "center" && "mx-auto", className)}
    >
      <label htmlFor={inputId} className="sr-only">
        Your website
      </label>
      <div className="flex flex-col gap-2 rounded-xl border border-border-strong bg-card p-1.5 shadow-sm transition-[border-color,box-shadow] focus-within:border-brand focus-within:ring-[3px] focus-within:ring-ring sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
          />
          <Input
            id={inputId}
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourcompany.com"
            value={website}
            onChange={(e) => {
              setWebsite(e.target.value);
              if (error) setError("");
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hintId}
            className="h-11 border-0 bg-transparent pl-9 text-base shadow-none hover:border-0 focus-visible:ring-0"
          />
        </div>
        <Button type="submit" variant="brand" size="lg" loading={pending} className="w-full sm:w-auto">
          Analyze my website
          {!pending && <ArrowRight />}
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className={cn("mt-2 text-[13px] text-destructive-text", align === "center" && "text-center")}>
          {error}
        </p>
      ) : (
        <p id={hintId} className={cn("mt-3 text-[13px] text-muted-foreground", align === "center" && "text-center")}>
          Free to start. $0 a month, then 5¢ for each delivered email.
        </p>
      )}
    </form>
  );
}

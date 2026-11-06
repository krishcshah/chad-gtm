"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@smartreach/ui";

/** Sends the user on automatically; the button is the fallback if that stalls. */
export function ContinueRedirect({ href, markSignup }: { href: string; markSignup: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (markSignup) {
      try {
        sessionStorage.setItem("chadgtm_just_signed_up", "1");
        localStorage.setItem("chadgtm_just_signed_up", "1");
      } catch {}
    }
    router.replace(href);
    router.refresh();
  }, [href, markSignup, router]);

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" className="h-10 w-full" onClick={() => router.replace(href)}>
        Continue
      </Button>
      <p className="text-center text-xs text-subtle-foreground" aria-live="polite">
        Not moving? Use the button above.
      </p>
    </div>
  );
}

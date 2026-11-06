"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@smartreach/ui";

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
    <Button type="button" variant="brand" className="w-full h-10 text-sm" onClick={() => router.replace(href)}>
      Continue
    </Button>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function PageTracker() {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    // Don't duplicate if path hasn't changed
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    const payload = JSON.stringify({
      path: pathname,
      pageTitle: typeof document !== "undefined" ? document.title : "",
      referrer: typeof document !== "undefined" ? document.referrer : "",
    });

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/track/page-view", blob);
      } else {
        fetch("/api/track/page-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Non-blocking telemetry
    }
  }, [pathname]);

  return null;
}

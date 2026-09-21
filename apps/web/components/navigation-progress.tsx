"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Top indigo progress bar — appears the instant you click a link and slides
 * across, so navigation always *feels* immediate even in dev (where Next
 * recompiles each route). No dependencies.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("/") && !href.startsWith("//") && href !== pathname) setActive(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  useEffect(() => {
    const t = setTimeout(() => setActive(false), 400);
    return () => clearTimeout(t);
  }, [pathname]);

  if (!active) return null;
  return (
    <div role="progressbar" className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[2.5px] overflow-hidden">
      <div
        className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-primary/70 to-primary"
        style={{ animation: "srProgressSlide 900ms cubic-bezier(0,0,0.2,1) infinite", boxShadow: "0 0 12px color-mix(in oklch, var(--primary) 80%, transparent)" }}
      />
      <style>{`@keyframes srProgressSlide { 0% { transform: translateX(-100%);} 100% { transform: translateX(400%);} }`}</style>
    </div>
  );
}

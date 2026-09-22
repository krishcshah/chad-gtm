"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const actions = [
  { keys: "g d", label: "Go to Dashboard", href: "/dashboard" },
  { keys: "g c", label: "Go to Campaigns", href: "/campaigns" },
  { keys: "g l", label: "Go to Leads", href: "/leads" },
  { keys: "g s", label: "Go to Senders", href: "/senders" },
  { keys: "g t", label: "Go to Templates", href: "/templates" },
  { keys: "g b", label: "Go to Blocklist", href: "/blocklist" },
  { keys: "c", label: "New Campaign", href: "/campaigns/new" },
];

/** Minimal keyboard navigation — press shortcuts like Linear's g+d / c. */
export function CommandPalette() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      const key = e.key.toLowerCase();
      const combo = pending ? `${pending} ${key}` : key;
      setPending(null);
      const match = actions.find((a) => a.keys === combo);
      if (match) {
        e.preventDefault();
        router.push(match.href);
      } else if (["g"].includes(key)) {
        setPending(key);
        setTimeout(() => setPending(null), 800);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pending]);

  return null;
}

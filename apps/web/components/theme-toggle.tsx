"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl, Skeleton } from "@smartreach/ui";

type ThemeChoice = "light" | "dark" | "system";

const OPTIONS: { value: ThemeChoice; label: ReactNode }[] = [
  {
    value: "light",
    label: (
      <>
        <Sun aria-hidden /> Light
      </>
    ),
  },
  {
    value: "dark",
    label: (
      <>
        <Moon aria-hidden /> Dark
      </>
    ),
  },
  {
    value: "system",
    label: (
      <>
        <Monitor aria-hidden /> System
      </>
    ),
  },
];

function toChoice(theme: string | undefined): ThemeChoice {
  return theme === "light" || theme === "dark" ? theme : "system";
}

/** Light / dark / system theme picker. Renders a placeholder until mounted to avoid a hydration mismatch. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Skeleton className="h-9 w-[252px] max-w-full rounded-lg" aria-hidden />;
  }

  return (
    <SegmentedControl
      aria-label="Theme"
      value={toChoice(theme)}
      onValueChange={(value) => setTheme(value)}
      options={OPTIONS}
      className={className}
    />
  );
}

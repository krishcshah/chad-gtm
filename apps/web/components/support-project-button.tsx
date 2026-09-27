"use client";

import * as React from "react";
import { Button } from "@smartreach/ui";
import { Heart } from "lucide-react";

export function SupportProjectButton({ className }: { className?: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("open-donation-modal"));
      }}
      className={`gap-1.5 border-rose-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium ${className}`}
    >
      <Heart className="size-3.5 fill-rose-500 text-rose-500" />
      <span>Support this project</span>
    </Button>
  );
}

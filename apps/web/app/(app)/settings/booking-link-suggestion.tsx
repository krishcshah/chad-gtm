"use client";

import { Button } from "@smartreach/ui";
import { hostOf } from "@/components/chad-gtm/working-panel";

/** "Use cal.com from your latest Autopilot run": fills the empty workspace booking link (saved with the card). */
export function BookingLinkSuggestion({ url, onUse }: { url: string; onUse: (url: string) => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="-mt-3 w-fit" onClick={() => onUse(url)}>
      Use {hostOf(url)} from your latest Autopilot run
    </Button>
  );
}

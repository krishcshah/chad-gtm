"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@smartreach/ui";
import { deleteSender, toggleSender } from "@/lib/actions";
import { isNextRedirect, isPermissionError, type SenderRow } from "./sender-types";

function reportFailure(message: string) {
  if (isPermissionError(message)) {
    toast.error("You don't have permission to change this mailbox.", {
      action: { label: "Sign in", onClick: () => window.location.assign("/login") },
    });
  } else {
    toast.error(message);
  }
}

/** Pause/resume and delete for a mailbox, shared by the table rows and the detail sheet. */
export function useSenderActions() {
  const router = useRouter();
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function toggle(sender: Pick<SenderRow, "id" | "status" | "email">) {
    const paused = sender.status === "paused";
    setTogglingId(sender.id);
    try {
      // toggleSender(id, pause): pause when it is not paused, resume when it is.
      const res = await toggleSender(sender.id, !paused);
      if (!res.ok) {
        reportFailure(res.error);
        return false;
      }
      toast.success(paused ? `${sender.email} resumed` : `${sender.email} paused`);
      router.refresh();
      return true;
    } catch (caught) {
      if (isNextRedirect(caught)) throw caught;
      reportFailure(caught instanceof Error ? caught.message : "Could not update this mailbox");
      return false;
    } finally {
      setTogglingId(null);
    }
  }

  async function remove(sender: Pick<SenderRow, "id" | "email">) {
    try {
      const res = await deleteSender(sender.id);
      if (!res.ok) {
        reportFailure(res.error || "Could not delete this mailbox");
        return false;
      }
      toast.success(`${sender.email} deleted`);
      router.refresh();
      return true;
    } catch (caught) {
      if (isNextRedirect(caught)) throw caught;
      reportFailure(caught instanceof Error ? caught.message : "Could not delete this mailbox");
      return false;
    }
  }

  return { toggle, remove, togglingId };
}

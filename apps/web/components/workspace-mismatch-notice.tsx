"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, toast } from "@smartreach/ui";
import { switchWorkspaceAction } from "@/lib/actions";

/** Shown on a page for something that belongs to another workspace than the active one. */
export function WorkspaceMismatchNotice({
  workspaceId,
  workspaceName,
  what = "run",
}: {
  workspaceId: string;
  workspaceName: string;
  /** What the page shows, e.g. "run". */
  what?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const name = workspaceName || "another";

  const switchTo = () =>
    start(async () => {
      const res = await switchWorkspaceAction(workspaceId);
      if (!res.ok) return void toast.error(res.error || "Couldn't switch workspace. Try again.");
      toast.success(`Switched to ${res.data?.name ?? name}`);
      router.refresh();
    });

  return (
    <Alert
      variant="info"
      action={
        <Button variant="outline" size="sm" onClick={switchTo} loading={pending}>
          Switch to {name}
        </Button>
      }
    >
      This {what} belongs to the {name} workspace. Switch to it to edit its campaign or sender details.
    </Alert>
  );
}

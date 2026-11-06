"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
} from "@smartreach/ui";
import { deleteAccountAction } from "@/lib/account-actions";

const CONFIRM_WORD = "DELETE";

/** Permanent account deletion. Asks the user to type DELETE before it runs. */
export function DangerZoneCard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = confirmation.trim() === CONFIRM_WORD;

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setError(null);
    }
  }

  function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!isConfirmed || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAccountAction(confirmation);
      if (res.ok) {
        toast.success("Your account and its data have been deleted");
        router.push("/login?deleted=true");
      } else {
        setError(res.error || "Your account could not be deleted. Try again.");
      }
    });
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>Permanently delete your account and everything in it. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Removes all workspaces, mailboxes, campaigns, leads and email history for{" "}
          <span className="font-medium text-foreground">{userEmail}</span>.
        </p>
        <Button variant="destructive-outline" onClick={() => setOpen(true)} className="shrink-0 self-start sm:self-auto">
          Delete account
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleDelete} className="flex flex-col gap-5">
            <DialogHeader>
              <DialogTitle>Delete your account?</DialogTitle>
              <DialogDescription>
                This permanently deletes <span className="font-medium text-foreground">{userEmail}</span> and signs you
                out. We cannot recover anything afterwards.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
              <p>Deleted right away:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Connected mailboxes and their stored credentials</li>
                <li>Campaigns, sequences and queued emails</li>
                <li>Lead lists, contacts and tags</li>
                <li>Inbox threads, replies and tracking history</li>
                <li>Workspaces and settings</li>
              </ul>
            </div>

            {error ? <Alert variant="destructive">{error}</Alert> : null}

            <Field label={`Type ${CONFIRM_WORD} to confirm`}>
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                disabled={isPending}
                className="font-mono"
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" loading={isPending} disabled={!isConfirmed}>
                Delete account permanently
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

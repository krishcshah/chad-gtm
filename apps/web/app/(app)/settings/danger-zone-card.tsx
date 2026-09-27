"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@smartreach/ui";
import { AlertTriangle, Trash2, ShieldAlert, Loader2 } from "lucide-react";
import { deleteAccountAction } from "@/lib/account-actions";
import { toast } from "sonner";

export function DangerZoneCard({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isConfirmed = confirmation.trim() === "DELETE";

  const handleDelete = () => {
    if (!isConfirmed) return;
    setError(null);

    startTransition(async () => {
      const res = await deleteAccountAction(confirmation);
      if (res.ok) {
        toast.success("Your account and all associated data have been permanently deleted.");
        // Redirect to login
        router.push("/login?deleted=true");
      } else {
        setError(res.error || "Failed to delete account. Please try again.");
      }
    });
  };

  return (
    <>
      <Card className="border-rose-500/30 bg-rose-500/5 shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-rose-500" />
                <h2 className="font-semibold text-base text-rose-500">Danger Zone</h2>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Irreversible actions that affect your account ownership and stored data.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-rose-400 shrink-0">
              Irreversible
            </span>
          </div>

          <div className="rounded-xl border border-rose-500/20 bg-background/60 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="font-bold text-sm text-foreground">Permanently Delete Account</h3>
                <p className="text-xs text-muted-foreground max-w-lg leading-relaxed">
                  Permanently erase your account, login credentials, all workspaces, connected mailboxes, campaigns, lead lists, uploaded contacts, and email records. Data cannot be recovered once purged.
                </p>
              </div>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => setModalOpen(true)}
                className="shrink-0 text-xs font-semibold gap-1.5 shadow-sm"
              >
                <Trash2 className="size-3.5" />
                Delete Account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md p-6 space-y-4">
          <DialogHeader className="space-y-2">
            <div className="flex size-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <ShieldAlert className="size-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-rose-500">
              Delete Account Permanently?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              This action <strong>cannot be undone</strong>. This will permanently delete your account (<code className="font-mono text-foreground">{userEmail}</code>) and immediately purge all:
            </DialogDescription>
          </DialogHeader>

          <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
            <li>Connected mailboxes &amp; encrypted credentials</li>
            <li>Outreach campaigns, email jobs &amp; sequence drafts</li>
            <li>Lead databases, custom prospect lists &amp; tags</li>
            <li>UniBox email threads, received replies &amp; tracking history</li>
            <li>Active session tokens &amp; workspace configuration</li>
          </ul>

          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-400">
            To confirm deletion, please type <strong className="font-mono text-foreground font-bold">DELETE</strong> below:
          </div>

          <div className="space-y-2">
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Type DELETE"
              className="text-xs font-mono h-9"
              autoFocus
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setModalOpen(false);
                setConfirmation("");
                setError(null);
              }}
              className="text-xs"
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!isConfirmed || isPending}
              onClick={handleDelete}
              className="text-xs font-semibold gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Purging Account...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" /> Purge Account Now
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

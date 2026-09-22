"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Briefcase, Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@smartreach/ui";
import { createWorkspaceAction } from "@/lib/actions";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter a workspace name");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await createWorkspaceAction({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }

      setName("");
      setDescription("");
      onOpenChange(false);
      onCreated?.();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Briefcase className="size-4" />
              </div>
              <DialogTitle>New Client Workspace</DialogTitle>
            </div>
            <DialogDescription>
              Each workspace is an isolated blank slate with its own mailboxes, lead lists, campaigns, and suppressions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace / Client Name *</Label>
              <Input
                id="ws-name"
                placeholder="e.g. Acme Corp, Berlin Outbound, Client X"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">Description (Optional)</Label>
              <Textarea
                id="ws-desc"
                placeholder="Notes about this client or outbound campaign scope..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 size-3.5" />
                  Create Workspace
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

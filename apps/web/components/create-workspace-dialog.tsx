"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Textarea,
} from "@smartreach/ui";
import { createWorkspaceAction } from "@/lib/actions";

interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

/** Create a workspace. The new workspace becomes the active one. */
export function CreateWorkspaceDialog({ open, onOpenChange, onCreated }: CreateWorkspaceDialogProps) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setNameError(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (loading) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Enter a name for the workspace.");
      return;
    }
    setLoading(true);
    setNameError(null);
    setError(null);
    try {
      const res = await createWorkspaceAction({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Created ${name.trim()} and switched to it`);
      reset();
      onOpenChange(false);
      onCreated?.();
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "The workspace could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>New workspace</DialogTitle>
            <DialogDescription>
              A workspace has its own mailboxes, leads, campaigns and blocklist. Use one per client or brand.
              You switch to it as soon as it is created.
            </DialogDescription>
          </DialogHeader>

          {error ? <Alert variant="destructive">{error}</Alert> : null}

          <Field label="Name" required error={nameError}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="Acme Corp"
              disabled={loading}
              autoFocus
              autoComplete="off"
              maxLength={120}
            />
          </Field>

          <Field label="Description" optional hint="Only you see this. Useful for client or scope notes.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outbound for Acme's EU sales team"
              disabled={loading}
              rows={2}
              className="min-h-0"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={!name.trim()}>
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

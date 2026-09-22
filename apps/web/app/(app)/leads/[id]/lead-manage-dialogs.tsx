"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { leadListRenameSchema } from "@smartreach/validation";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  PermissionDenied,
} from "@smartreach/ui";
import { bulkDeleteLeads, deleteLead, renameLeadList } from "@/lib/actions";
import { isNextRedirect, isPermissionError } from "@/lib/lead-form";

type LeadRef = { id: string; email: string };

export function RenameListDialog({
  open,
  listId,
  name,
  onOpenChange,
  onRenamed,
}: {
  open: boolean;
  listId: string;
  name: string;
  onOpenChange: (open: boolean) => void;
  onRenamed: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, start] = useTransition();

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const parsed = leadListRenameSchema.safeParse({ name: value });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Give the list a name");
      setFormError(parsed.error.issues[0]?.message ?? "Give the list a name");
      return;
    }
    setFieldError(null);
    setFormError(null);
    start(async () => {
      try {
        const res = await renameLeadList(listId, { name: parsed.data.name });
        if (!res.ok) {
          if (isPermissionError(res.error)) {
            setDenied(true);
            return;
          }
          const message = res.fieldErrors?.name?.[0] ?? res.error;
          setFieldError(message);
          setFormError(res.error);
          return;
        }
        onRenamed(parsed.data.name);
        onOpenChange(false);
      } catch (error) {
        if (isNextRedirect(error)) throw error;
        const message = error instanceof Error ? error.message : "Could not rename this list";
        if (isPermissionError(message)) setDenied(true);
        else setFormError(message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>Rename list</DialogTitle>
          <DialogDescription>This name is what you see on the Leads page.</DialogDescription>
        </DialogHeader>
        {denied ? (
          <PermissionDenied />
        ) : (
          <form onSubmit={save} className="space-y-4" noValidate>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <Field label="List name" required error={fieldError ?? undefined}>
              <Input
                autoFocus
                value={value}
                maxLength={120}
                disabled={pending}
                onChange={(event) => {
                  setValue(event.target.value);
                  setFieldError(null);
                }}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? "Saving…" : "Save name"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteLeadsDialog({
  open,
  mode,
  leads,
  onOpenChange,
  onDeleted,
}: {
  open: boolean;
  mode: "one" | "bulk";
  leads: LeadRef[];
  onOpenChange: (open: boolean) => void;
  onDeleted: (ids: string[]) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, start] = useTransition();
  const count = leads.length;
  const single = mode === "one" && count === 1;

  const confirm = () => {
    if (pending || count === 0) return;
    setFormError(null);
    start(async () => {
      try {
        const res = single ? await deleteLead(leads[0].id) : await bulkDeleteLeads(leads.map((lead) => lead.id));
        if (!res.ok) {
          if (isPermissionError(res.error)) {
            setDenied(true);
            return;
          }
          setFormError(res.error);
          return;
        }
        onDeleted(leads.map((lead) => lead.id));
        onOpenChange(false);
      } catch (error) {
        if (isNextRedirect(error)) throw error;
        const message = error instanceof Error ? error.message : "Could not delete leads";
        if (isPermissionError(message)) setDenied(true);
        else setFormError(message);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>{single ? "Delete lead" : `Delete ${count} leads`}</DialogTitle>
          <DialogDescription>
            {single
              ? `Remove ${leads[0]?.email ?? "this lead"} from the list.`
              : `Remove ${count} selected leads from the list.`}
          </DialogDescription>
        </DialogHeader>
        {denied ? (
          <PermissionDenied />
        ) : (
          <div className="space-y-4">
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">Deleted leads stay out of this list and future sends.</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirm} disabled={pending || count === 0}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? "Deleting…" : single ? "Delete lead" : "Delete leads"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

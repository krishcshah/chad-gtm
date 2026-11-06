"use client";

import { useState, useTransition } from "react";
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
import { bulkDeleteLeads, deleteLead, deleteLeadList, renameLeadList } from "@/lib/actions";
import { isNextRedirect, isPermissionError } from "@/lib/lead-form";

type LeadRef = { id: string; email: string };

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription className="mt-0 text-foreground">{message}</AlertDescription>
    </Alert>
  );
}

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
      setFormError(null);
      return;
    }
    if (parsed.data.name === name) {
      onOpenChange(false);
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
          const fieldMessage = res.fieldErrors?.name?.[0];
          if (fieldMessage) setFieldError(fieldMessage);
          else setFormError(res.error);
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rename list</DialogTitle>
          <DialogDescription>Campaigns that use this list keep working; only the name changes.</DialogDescription>
        </DialogHeader>
        {denied ? (
          <PermissionDenied className="py-10" />
        ) : (
          <form onSubmit={save} className="flex flex-col gap-5" noValidate>
            <FormError message={formError} />
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
              <Button type="submit" loading={pending}>
                Save name
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{single ? "Delete lead" : `Delete ${count.toLocaleString()} leads`}</DialogTitle>
          <DialogDescription>
            {single ? (
              <>
                <span className="font-medium text-foreground">{leads[0]?.email ?? "This lead"}</span> is removed from
                this list and gets no further emails from it.
              </>
            ) : (
              `The ${count.toLocaleString()} selected leads are removed from this list and get no further emails from it.`
            )}
          </DialogDescription>
        </DialogHeader>
        {denied ? (
          <PermissionDenied className="py-10" />
        ) : (
          <>
            <FormError message={formError} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirm} loading={pending} disabled={count === 0}>
                {single ? "Delete lead" : "Delete leads"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DeleteListDialog({
  open,
  listId,
  name,
  leadCount,
  onOpenChange,
  onDeleted,
}: {
  open: boolean;
  listId: string;
  name: string;
  /** When known, the dialog says how many leads go with the list. */
  leadCount?: number;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const confirm = () => {
    if (pending) return;
    setFormError(null);
    start(async () => {
      try {
        const res = await deleteLeadList(listId);
        if (!res.ok) {
          if (isPermissionError(res.error)) {
            setDenied(true);
            return;
          }
          setFormError(res.error || "Could not delete this list");
        } else {
          onOpenChange(false);
          onDeleted();
        }
      } catch (e) {
        if (isNextRedirect(e)) throw e;
        setFormError(e instanceof Error ? e.message : "Could not delete this list");
      }
    });
  };

  const consequence =
    leadCount === 0
      ? "The list is empty, so no leads are deleted."
      : `This also deletes ${
          leadCount === undefined
            ? "every lead in it"
            : `its ${leadCount.toLocaleString()} ${leadCount === 1 ? "lead" : "leads"}`
        }. Reports for past campaigns keep their totals.`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{name}&rdquo;?</DialogTitle>
          <DialogDescription>{consequence}</DialogDescription>
        </DialogHeader>
        {denied ? (
          <PermissionDenied className="py-10" />
        ) : (
          <>
            <FormError message={formError} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={confirm} loading={pending}>
                Delete list
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

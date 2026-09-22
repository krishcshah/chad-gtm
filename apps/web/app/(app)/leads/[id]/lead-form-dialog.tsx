"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { createLead, updateLead } from "@/lib/actions";
import {
  asCustomFields,
  isNextRedirect,
  isPermissionError,
  prepareLeadDraft,
  type LeadFieldErrors,
} from "@/lib/lead-form";

export interface LeadFormLead {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: string;
  tags: string[] | null;
  customFields?: Record<string, string> | null;
}

interface FieldRow {
  id: string;
  name: string;
  value: string;
}

function rowsFromLead(lead: LeadFormLead | null): FieldRow[] {
  return Object.entries(asCustomFields(lead?.customFields)).map(([name, value]) => ({
    id: crypto.randomUUID(),
    name,
    value,
  }));
}

export function LeadFormDialog({
  open,
  mode,
  listId,
  lead,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  listId: string;
  lead: LeadFormLead | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: LeadFormLead) => void;
}) {
  const [email, setEmail] = useState(lead?.email ?? "");
  const [firstName, setFirstName] = useState(lead?.firstName ?? "");
  const [lastName, setLastName] = useState(lead?.lastName ?? "");
  const [company, setCompany] = useState(lead?.company ?? "");
  const [fields, setFields] = useState<FieldRow[]>(() => rowsFromLead(lead));
  const [fieldErrors, setFieldErrors] = useState<LeadFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [pending, start] = useTransition();

  const clearError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearCustomFieldErrors = () => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key === "customFields" || key.startsWith("customFields.")) delete next[key];
      }
      return next;
    });
  };

  const addField = () => {
    setFields((prev) => [...prev, { id: crypto.randomUUID(), name: "", value: "" }]);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const prepared = prepareLeadDraft(mode, {
      listId,
      email,
      firstName,
      lastName,
      company,
      customFields: fields.map(({ name, value }) => ({ name, value })),
      originalCustomFields: mode === "edit" ? asCustomFields(lead?.customFields) : undefined,
    });

    if (!prepared.ok) {
      setFieldErrors(prepared.fieldErrors);
      setFormError(prepared.error);
      setDenied(false);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    start(async () => {
      try {
        if (prepared.mode === "create") {
          const res = await createLead(prepared.input);
          if (!res.ok) {
            showActionError(res.error, res.fieldErrors);
            return;
          }
          if (!res.data?.id) {
            setFormError("The lead was not created. Try again.");
            return;
          }
          toast.success("Lead added");
          onSaved({
            id: res.data.id,
            email: prepared.input.email.trim().toLowerCase(),
            firstName: prepared.input.firstName,
            lastName: prepared.input.lastName,
            company: prepared.input.company,
            status: "new",
            tags: [],
            customFields: prepared.savedCustomFields,
          });
          return;
        }

        if (!lead) {
          setFormError("Choose a lead to edit.");
          return;
        }
        const res = await updateLead(lead.id, prepared.input);
        if (!res.ok) {
          showActionError(res.error, res.fieldErrors);
          return;
        }
        toast.success("Lead updated");
        onSaved({
          ...lead,
          email: prepared.input.email.trim().toLowerCase(),
          firstName: prepared.input.firstName,
          lastName: prepared.input.lastName,
          company: prepared.input.company,
          customFields: prepared.savedCustomFields,
        });
      } catch (error) {
        if (isNextRedirect(error)) throw error;
        const message = error instanceof Error ? error.message : "Something went wrong";
        if (isPermissionError(message)) setDenied(true);
        else setFormError(message);
      }
    });
  };

  const showActionError = (error: string, serverFields?: Record<string, string[]>) => {
    if (isPermissionError(error)) {
      setDenied(true);
      return;
    }
    const next: LeadFieldErrors = {};
    for (const [key, messages] of Object.entries(serverFields ?? {})) {
      if (messages?.[0]) next[key] = messages[0];
    }
    if (/email/i.test(error) && !next.email) next.email = error;
    setFieldErrors(next);
    setFormError(error);
  };

  const title = mode === "create" ? "Add Lead" : "Edit Lead";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Email is required. Name, company, and custom fields are optional."
              : "Update this contact. Remove a custom field to delete it from the lead."}
          </DialogDescription>
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

            <Field label="Email" required error={fieldErrors.email}>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                disabled={pending}
                placeholder="ada@company.com"
                maxLength={255}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearError("email");
                }}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={fieldErrors.firstName}>
                <Input
                  autoComplete="given-name"
                  value={firstName}
                  disabled={pending}
                  maxLength={120}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    clearError("firstName");
                  }}
                />
              </Field>
              <Field label="Last name" error={fieldErrors.lastName}>
                <Input
                  autoComplete="family-name"
                  value={lastName}
                  disabled={pending}
                  maxLength={120}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    clearError("lastName");
                  }}
                />
              </Field>
            </div>

            <Field label="Company" error={fieldErrors.company}>
              <Input
                autoComplete="organization"
                value={company}
                disabled={pending}
                maxLength={160}
                onChange={(event) => {
                  setCompany(event.target.value);
                  clearError("company");
                }}
              />
            </Field>

            <fieldset className="space-y-3" disabled={pending}>
              <legend className="text-[13px] font-medium text-foreground/90">Custom fields</legend>
              {fields.length === 0 ? (
                <p className="text-xs text-muted-foreground" role="status">
                  No custom fields yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {fields.map((row, index) => {
                    const nameError = fieldErrors[`customFields.${index}.name`];
                    const valueError = fieldErrors[`customFields.${index}.value`];
                    const nameId = `${row.id}-name`;
                    const valueId = `${row.id}-value`;
                    return (
                      <li key={row.id} className="space-y-1.5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="min-w-0 flex-1 space-y-1">
                            <label htmlFor={nameId} className="sr-only">
                              Custom field name
                            </label>
                            <Input
                              id={nameId}
                              value={row.name}
                              maxLength={64}
                              placeholder="Field name"
                              aria-invalid={!!nameError}
                              aria-describedby={nameError ? `${nameId}-error` : undefined}
                              onChange={(event) => {
                                const name = event.target.value;
                                setFields((prev) => prev.map((item) => (item.id === row.id ? { ...item, name } : item)));
                                clearError(`customFields.${index}.name`);
                              }}
                            />
                          </div>
                          <div className="min-w-0 flex-[1.4] space-y-1">
                            <label htmlFor={valueId} className="sr-only">
                              Custom field value
                            </label>
                            <Input
                              id={valueId}
                              value={row.value}
                              maxLength={2000}
                              placeholder="Value"
                              aria-invalid={!!valueError}
                              aria-describedby={valueError ? `${valueId}-error` : undefined}
                              onChange={(event) => {
                                const value = event.target.value;
                                setFields((prev) => prev.map((item) => (item.id === row.id ? { ...item, value } : item)));
                                clearError(`customFields.${index}.value`);
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            aria-label={row.name.trim() ? `Remove ${row.name.trim()}` : "Remove custom field"}
                            onClick={() => {
                              setFields((prev) => prev.filter((item) => item.id !== row.id));
                              clearCustomFieldErrors();
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                        {nameError ? (
                          <p id={`${nameId}-error`} className="text-xs text-destructive">
                            {nameError}
                          </p>
                        ) : null}
                        {valueError ? (
                          <p id={`${valueId}-error`} className="text-xs text-destructive">
                            {valueError}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
              {fieldErrors.customFields ? (
                <p className="text-xs text-destructive">{fieldErrors.customFields}</p>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={addField} disabled={fields.length >= 50}>
                + field
              </Button>
              {fields.length >= 50 ? (
                <p className="text-xs text-muted-foreground">A lead can have at most 50 custom fields.</p>
              ) : null}
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pending ? "Saving…" : "Save lead"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

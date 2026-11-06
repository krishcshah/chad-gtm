"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
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

const MAX_CUSTOM_FIELDS = 50;

const INLINE_KEYS = /^(email|firstName|lastName|company|customFields|customFields\.\d+\.(name|value))$/;

/** True when every error has an inline home next to its control. */
function allInline(errors: LeadFieldErrors) {
  const keys = Object.keys(errors);
  return keys.length > 0 && keys.every((key) => INLINE_KEYS.test(key));
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

  const updateField = (id: string, patch: Partial<Omit<FieldRow, "id">>) => {
    setFields((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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
    setFormError(allInline(next) ? null : error);
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
      setFormError(allInline(prepared.fieldErrors) ? null : prepared.error);
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

  const atFieldLimit = fields.length >= MAX_CUSTOM_FIELDS;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add lead" : "Edit lead"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Only the email is required. New leads start with the status New."
              : "Changes apply to future emails. Past emails are not changed."}
          </DialogDescription>
        </DialogHeader>

        {denied ? (
          <PermissionDenied className="py-10" />
        ) : (
          <form onSubmit={save} className="flex flex-col gap-5" noValidate>
            {formError ? (
              <Alert variant="destructive">
                <AlertDescription className="mt-0 text-foreground">{formError}</AlertDescription>
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

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name" optional error={fieldErrors.firstName}>
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
              <Field label="Last name" optional error={fieldErrors.lastName}>
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

            <Field label="Company" optional error={fieldErrors.company}>
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

            <fieldset className="flex flex-col gap-3 border-t border-border pt-5" disabled={pending}>
              <legend className="sr-only">Custom fields</legend>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p aria-hidden className="text-[13px] font-medium text-foreground">
                    Custom fields
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Use them in templates as variables, for example {"{{"}role{"}}"}.
                  </p>
                </div>
                <Button type="button" variant="outline" size="xs" onClick={addField} disabled={atFieldLimit}>
                  <Plus />
                  Add field
                </Button>
              </div>

              {fields.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {fields.map((row, index) => {
                    const nameError = fieldErrors[`customFields.${index}.name`];
                    const valueError = fieldErrors[`customFields.${index}.value`];
                    const nameId = `${row.id}-name`;
                    const valueId = `${row.id}-value`;
                    const label = row.name.trim();
                    return (
                      <li key={row.id} className="flex flex-col gap-1">
                        <div className="flex items-start gap-2">
                          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                            <label htmlFor={nameId} className="sr-only">
                              Custom field name
                            </label>
                            <Input
                              id={nameId}
                              value={row.name}
                              maxLength={64}
                              placeholder="Field name"
                              className="font-mono text-[13px]"
                              aria-invalid={nameError ? true : undefined}
                              aria-describedby={nameError ? `${nameId}-error` : undefined}
                              onChange={(event) => {
                                updateField(row.id, { name: event.target.value });
                                clearError(`customFields.${index}.name`);
                              }}
                            />
                            <label htmlFor={valueId} className="sr-only">
                              {label ? `Value for ${label}` : "Custom field value"}
                            </label>
                            <Input
                              id={valueId}
                              value={row.value}
                              maxLength={2000}
                              placeholder="Value"
                              aria-invalid={valueError ? true : undefined}
                              aria-describedby={valueError ? `${valueId}-error` : undefined}
                              onChange={(event) => {
                                updateField(row.id, { value: event.target.value });
                                clearError(`customFields.${index}.value`);
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={label ? `Remove ${label}` : "Remove custom field"}
                            onClick={() => {
                              setFields((prev) => prev.filter((item) => item.id !== row.id));
                              clearCustomFieldErrors();
                            }}
                          >
                            <X />
                          </Button>
                        </div>
                        {nameError ? (
                          <p id={`${nameId}-error`} className="text-xs text-destructive-text">
                            {nameError}
                          </p>
                        ) : null}
                        {valueError ? (
                          <p id={`${valueId}-error`} className="text-xs text-destructive-text">
                            {valueError}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {fieldErrors.customFields ? (
                <p className="text-xs text-destructive-text">{fieldErrors.customFields}</p>
              ) : null}
              {atFieldLimit ? (
                <p className="text-xs text-muted-foreground">A lead can have up to {MAX_CUSTOM_FIELDS} custom fields.</p>
              ) : null}
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" loading={pending}>
                {mode === "create" ? "Add lead" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

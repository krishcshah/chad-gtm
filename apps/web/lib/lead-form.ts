/**
 * Client-side lead form payload builder.
 * Email is required. Custom field removal is a null patch key (server merges).
 */
import { leadCreateSchema, leadUpdateSchema } from "@smartreach/validation";
import { formatZodActionError } from "./zod-action-error";

export interface CustomFieldDraft {
  name: string;
  value: string;
}

export interface LeadDraftInput {
  listId: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  customFields: CustomFieldDraft[];
  /** Keys present before this edit. Missing keys are sent as null. */
  originalCustomFields?: Record<string, string>;
}

export type LeadFieldErrors = Record<string, string>;

export interface PreparedCreateLead {
  ok: true;
  mode: "create";
  input: {
    listId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    customFields?: Record<string, string>;
  };
  savedCustomFields: Record<string, string>;
}

export interface PreparedUpdateLead {
  ok: true;
  mode: "edit";
  input: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    customFields?: Record<string, string | null>;
  };
  savedCustomFields: Record<string, string>;
}

export type PreparedLead =
  | PreparedCreateLead
  | PreparedUpdateLead
  | { ok: false; error: string; fieldErrors: LeadFieldErrors };

const MAX_CUSTOM_FIELDS = 50;

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function asCustomFields(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

export function isPermissionError(message: string): boolean {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

export function isNextRedirect(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

function collectCustomFields(drafts: CustomFieldDraft[]): {
  rows: { name: string; value: string }[];
  fieldErrors: LeadFieldErrors;
} {
  const fieldErrors: LeadFieldErrors = {};
  const rows: { name: string; value: string }[] = [];
  const seen = new Map<string, number>();

  drafts.forEach((draft, index) => {
    const name = draft.name.trim();
    const value = draft.value.trim();
    if (!name && !value) return;
    if (!name) {
      fieldErrors[`customFields.${index}.name`] = "Field name is required";
      return;
    }
    if (name.length > 64) {
      fieldErrors[`customFields.${index}.name`] = "Field name must be 64 characters or fewer";
    }
    if (draft.value.length > 2000) {
      fieldErrors[`customFields.${index}.value`] = "Field value must be 2000 characters or fewer";
    }
    const prior = seen.get(name);
    if (prior !== undefined) {
      fieldErrors[`customFields.${index}.name`] = "Field name is already used";
      fieldErrors[`customFields.${prior}.name`] = "Field name is already used";
    } else {
      seen.set(name, index);
    }
    rows.push({ name, value });
  });

  if (rows.length > MAX_CUSTOM_FIELDS) {
    fieldErrors.customFields = "A lead can have at most 50 custom fields";
  }

  return { rows, fieldErrors };
}

function applySchemaIssues(
  fieldErrors: LeadFieldErrors,
  issues: { path: PropertyKey[]; message: string }[],
) {
  const formatted = formatZodActionError(issues);
  for (const [key, messages] of Object.entries(formatted.fieldErrors)) {
    if (!fieldErrors[key] && messages[0]) fieldErrors[key] = messages[0];
  }
}

function failure(fieldErrors: LeadFieldErrors): PreparedLead {
  const email = fieldErrors.email;
  const error = email ?? Object.values(fieldErrors)[0] ?? "Some fields are invalid";
  return { ok: false, error, fieldErrors };
}

export function prepareLeadDraft(mode: "create" | "edit", draft: LeadDraftInput): PreparedLead {
  const fieldErrors: LeadFieldErrors = {};
  const email = draft.email.trim();
  if (!email) fieldErrors.email = "Email is required";

  const { rows, fieldErrors: customErrors } = collectCustomFields(draft.customFields);
  Object.assign(fieldErrors, customErrors);

  const savedCustomFields = Object.fromEntries(rows.map((row) => [row.name, row.value]));
  const profile = {
    email,
    firstName: blankToNull(draft.firstName),
    lastName: blankToNull(draft.lastName),
    company: blankToNull(draft.company),
  };

  if (mode === "create") {
    const input: PreparedCreateLead["input"] = {
      listId: draft.listId,
      ...profile,
      ...(rows.length ? { customFields: savedCustomFields } : {}),
    };
    const parsed = leadCreateSchema.safeParse(input);
    if (!parsed.success) applySchemaIssues(fieldErrors, parsed.error.issues);
    if (Object.keys(fieldErrors).length) return failure(fieldErrors);
    return { ok: true, mode: "create", input, savedCustomFields };
  }

  const original = draft.originalCustomFields ?? {};
  const patch: Record<string, string | null> = { ...savedCustomFields };
  for (const key of Object.keys(original)) {
    if (!(key in savedCustomFields)) patch[key] = null;
  }

  const input: PreparedUpdateLead["input"] = {
    ...profile,
    ...(Object.keys(patch).length ? { customFields: patch } : {}),
  };
  const parsed = leadUpdateSchema.safeParse(input);
  if (!parsed.success) applySchemaIssues(fieldErrors, parsed.error.issues);
  if (Object.keys(fieldErrors).length) return failure(fieldErrors);
  return { ok: true, mode: "edit", input, savedCustomFields };
}

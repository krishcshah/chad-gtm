"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert, Button, Field, Input, Textarea, cn } from "@smartreach/ui";
import { submitTicketAction } from "@/lib/support-actions";
import { TICKET_CATEGORIES, type TicketCategory } from "@/lib/support-types";
import { TICKET_CATEGORY_META } from "./ticket-category-badge";

type Errors = { heading?: string; description?: string; url?: string };

/** Adds https:// when the user pasted a link without a scheme ("autogtm.tech/campaigns"). */
function normalizeUrl(value: string) {
  const v = value.trim();
  if (!v) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
}

function validUrl(value: string) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * New support ticket. On success it opens the ticket thread.
 * `onCancel` adds a Cancel button (used inside a dialog).
 */
export function TicketCreateForm({
  onSuccess,
  onCancel,
  defaultCategory = "bug_report",
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
  defaultCategory?: TicketCategory;
}) {
  const router = useRouter();
  const legendId = useId();
  const [isPending, startTransition] = useTransition();

  const [category, setCategory] = useState<TicketCategory>(defaultCategory);
  const [heading, setHeading] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): Errors {
    const next: Errors = {};
    if (heading.trim().length < 3) next.heading = "Write a subject of at least 3 characters.";
    if (description.trim().length < 5) next.description = "Describe the issue or request in a sentence or two.";
    if (!validUrl(normalizeUrl(url))) next.url = "Enter a web link, such as https://autogtm.tech/campaigns, or leave it empty.";
    return next;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    startTransition(async () => {
      const res = await submitTicketAction({
        category,
        heading: heading.trim(),
        description: description.trim(),
        url: normalizeUrl(url) || undefined,
      });
      if (res.ok && res.id) {
        toast.success("Ticket created");
        onSuccess?.();
        router.push(`/support/${res.id}`);
      } else {
        const message = res.error || "The ticket could not be created. Try again.";
        setFormError(message);
        toast.error(message);
      }
    });
  }

  const isBug = category === "bug_report";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <fieldset className="flex flex-col gap-2" aria-labelledby={legendId}>
        <legend id={legendId} className="mb-2 text-[13px] font-medium text-foreground">
          What is this about?
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {TICKET_CATEGORIES.map((cat) => {
            const meta = TICKET_CATEGORY_META[cat.id];
            const Icon = meta.icon;
            const selected = category === cat.id;
            return (
              <label
                key={cat.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring",
                  selected ? "border-foreground bg-muted/60" : "border-border-strong hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="category"
                  value={cat.id}
                  checked={selected}
                  onChange={() => setCategory(cat.id)}
                  className="sr-only"
                  disabled={isPending}
                />
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", selected ? "text-foreground" : "text-muted-foreground")}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{meta.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {meta.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field label="Subject" required error={errors.heading}>
        <Input
          value={heading}
          onChange={(e) => setHeading(e.target.value)}
          placeholder={isBug ? "CSV import stops before it finishes" : "A short summary"}
          disabled={isPending}
          maxLength={200}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Details"
        required
        error={errors.description}
        hint={isBug ? "What did you do, what did you expect, and what happened instead?" : undefined}
      >
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder={
            isBug
              ? "I uploaded a 2,000-row CSV on the Leads page. The progress bar stopped at 95% and no leads were added."
              : "Tell us as much as you can."
          }
          disabled={isPending}
        />
      </Field>

      <Field
        label="Page link"
        optional
        error={errors.url}
        hint="The page where it happened helps us find it faster."
      >
        <Input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://autogtm.tech/campaigns/…"
          disabled={isPending}
          autoComplete="off"
        />
      </Field>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={isPending}>
          Create ticket
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Layers, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, ConfirmDialog, Input, Popover, PopoverContent, PopoverTrigger } from "@smartreach/ui";
import { deleteTemplate, renameTemplate } from "@/lib/actions";
import {
  PRESET_SEQUENCES,
  isSequenceTemplate,
  parseSequenceTemplate,
  type ReusableSequence,
} from "@/lib/sequence-templates";
import type { TemplateOpt } from "./wizard-types";
import { plural } from "./wizard-utils";

/**
 * "Use a template" menu: replace the sequence with a saved/starter one, or drop a single email into the open step.
 * Your own saved sequences and single emails can be renamed or deleted here (starter sequences can't).
 */
export function SequenceLibrary({
  templates,
  onApplySequence,
  onApplySingle,
  onTemplateRenamed,
  onTemplateDeleted,
}: {
  templates: TemplateOpt[];
  onApplySequence: (seq: ReusableSequence) => void;
  onApplySingle: (tpl: TemplateOpt) => void;
  onTemplateRenamed?: (id: string, name: string) => void;
  onTemplateDeleted?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const saved = useMemo(
    () => templates.filter((t) => isSequenceTemplate(t.bodyText)).map((t) => parseSequenceTemplate(t)),
    [templates],
  );
  const singles = useMemo(() => templates.filter((t) => !isSequenceTemplate(t.bodyText)), [templates]);

  const ownActions = (id: string, name: string) => (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Rename “${name}”`}
        onClick={() => setRenamingId(id)}
      >
        <Pencil />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete “${name}”`}
        onClick={() => {
          setOpen(false);
          setDeleting({ id, name });
        }}
      >
        <Trash2 />
      </Button>
    </>
  );

  const renameRow = (id: string, name: string) => (
    <RenameForm
      key={id}
      templateId={id}
      initialName={name}
      onCancel={() => setRenamingId(null)}
      onSaved={(next) => {
        setRenamingId(null);
        onTemplateRenamed?.(id, next);
      }}
    />
  );

  return (
    <>
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setRenamingId(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Layers />
          Use a template
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
        // Escape while renaming cancels the rename, not the whole menu.
        onEscapeKeyDown={(e) => {
          if (renamingId) e.preventDefault();
        }}
      >
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Start from a template</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A sequence replaces all steps. A single email fills the step you have open.
          </p>
        </div>
        <div className="max-h-[min(26rem,60dvh)] overflow-y-auto py-1">
          {saved.length > 0 && (
            <Section title="Your sequences">
              {saved.map((seq) =>
                renamingId === seq.id ? (
                  renameRow(seq.id, seq.name)
                ) : (
                  <Item
                    key={seq.id}
                    title={seq.name}
                    description={seq.description}
                    meta={plural(seq.stepsCount, "email")}
                    onClick={() => {
                      onApplySequence(seq);
                      setOpen(false);
                    }}
                    actions={ownActions(seq.id, seq.name)}
                  />
                ),
              )}
            </Section>
          )}
          <Section title="Starter sequences">
            {PRESET_SEQUENCES.map((seq) => (
              <Item
                key={seq.id}
                title={seq.name}
                description={seq.description}
                meta={plural(seq.stepsCount, "email")}
                onClick={() => {
                  onApplySequence(seq);
                  setOpen(false);
                }}
              />
            ))}
          </Section>
          {singles.length > 0 && (
            <Section title="Single emails">
              {singles.map((tpl) =>
                renamingId === tpl.id ? (
                  renameRow(tpl.id, tpl.name)
                ) : (
                  <Item
                    key={tpl.id}
                    title={tpl.name}
                    description={tpl.subject}
                    meta="Fill this step"
                    onClick={() => {
                      onApplySingle(tpl);
                      setOpen(false);
                    }}
                    actions={ownActions(tpl.id, tpl.name)}
                  />
                ),
              )}
            </Section>
          )}
        </div>
      </PopoverContent>
    </Popover>
    <ConfirmDialog
      open={deleting !== null}
      onOpenChange={(o) => {
        if (!o) setDeleting(null);
      }}
      destructive
      title={`Delete “${deleting?.name ?? ""}”?`}
      description="It is removed from your templates. Campaigns that already use it keep their emails."
      confirmLabel="Delete template"
      onConfirm={async () => {
        if (!deleting) return;
        const { id, name } = deleting;
        const res = await deleteTemplate(id);
        if (res.ok) {
          onTemplateDeleted?.(id);
          toast.success(`Deleted “${name}”`);
        } else {
          toast.error(res.error);
        }
      }}
    />
    </>
  );
}

/** Inline rename for one saved template: Enter saves, Escape cancels. Errors stay under the field. */
function RenameForm({
  templateId,
  initialName,
  onCancel,
  onSaved,
}: {
  templateId: string;
  initialName: string;
  onCancel: () => void;
  onSaved: (name: string) => void;
}) {
  const [value, setValue] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Not a <form>: this popover renders inside the wizard's form tree.
  const save = () =>
    start(async () => {
      const res = await renameTemplate(templateId, value);
      if (res.ok) {
        toast.success(res.message ?? "Template renamed");
        onSaved(res.data?.name ?? value.trim());
      } else {
        setError(res.error);
      }
    });

  return (
    <li className="px-4 py-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Template name"
          autoFocus
          value={value}
          maxLength={120}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (!pending) save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          className="h-8 min-w-0 flex-1"
        />
        <Button type="button" size="sm" loading={pending} onClick={save}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-4 pb-1 pt-2 text-xs font-medium text-subtle-foreground">{title}</p>
      <ul>{children}</ul>
    </div>
  );
}

/** One row: the apply button and (for your own templates) its actions are siblings, never nested buttons. */
function Item({
  title,
  description,
  meta,
  onClick,
  actions,
}: {
  title: string;
  description?: string;
  meta: string;
  onClick: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <li className="flex items-start transition-colors hover:bg-muted focus-within:bg-muted">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-3 px-4 py-2 text-left outline-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
          {description ? (
            <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <span className="tabular shrink-0 pt-0.5 text-xs text-subtle-foreground">{meta}</span>
      </button>
      {actions ? <span className="flex shrink-0 items-center gap-0.5 py-1.5 pr-2">{actions}</span> : null}
    </li>
  );
}

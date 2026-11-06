"use client";

import { Fragment, useCallback, useRef } from "react";
import { Button, cn } from "@smartreach/ui";

/** Variables offered as one-click inserts. Any CSV column also works as a variable. */
export const SEQUENCE_VARIABLES = ["first_name", "company", "sender_name"] as const;
export const EMAIL_VARIABLES = ["first_name", "last_name", "company", "job_title", "website", "sender_name"] as const;

/**
 * Inserts text at the caret of a textarea (or at the end if the user has not
 * placed the caret yet), then puts the caret after the inserted text.
 */
export function useCaretInsert(value: string, onChange: (next: string) => void) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const touched = useRef(false);

  const onSelect = useCallback(() => {
    touched.current = true;
  }, []);

  const insert = useCallback(
    (token: string) => {
      const el = ref.current;
      const start = el && touched.current ? el.selectionStart : value.length;
      const end = el && touched.current ? el.selectionEnd : value.length;
      const before = value.slice(0, start);
      const after = value.slice(end);
      const pad = before && !/\s$/.test(before) ? " " : "";
      const next = before + pad + token + after;
      onChange(next);
      const caret = (before + pad + token).length;
      requestAnimationFrame(() => {
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
        touched.current = true;
      });
    },
    [value, onChange],
  );

  return { ref, onSelect, insert };
}

export function VariableButtons({
  variables,
  onInsert,
  className,
}: {
  variables: readonly string[];
  onInsert: (token: string) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label="Insert a variable" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="mr-0.5 text-xs text-muted-foreground">Insert</span>
      {variables.map((v) => (
        <Button
          key={v}
          type="button"
          variant="outline"
          size="xs"
          className="font-mono"
          onClick={() => onInsert(`{{${v}}}`)}
          aria-label={`Insert ${v.replace(/_/g, " ")}`}
        >
          {`{{${v}}}`}
        </Button>
      ))}
    </div>
  );
}

const TOKEN_RE = /(\{\{[^}]*\}\})/g;

/** Text with merge variables shown as quiet inline chips. */
export function HighlightedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("{{") && part.endsWith("}}") ? (
          <span key={i} className="rounded bg-muted px-1 py-px font-mono text-[12px] text-foreground ring-1 ring-inset ring-border">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

"use client";

import { useId, useState } from "react";
import { Braces, Link2, Shuffle } from "lucide-react";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import {
  Button,
  Field,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@smartreach/ui";
import { PRIMARY_VARS, fieldLabel, safeUrl, sentenceCase } from "./utils";

const chipClasses =
  "inline-flex h-6 items-center rounded-md border border-border bg-muted/60 px-1.5 font-mono text-xs text-foreground transition-colors hover:bg-accent outline-none focus-visible:ring-[3px] focus-visible:ring-ring";

/** Full variable list plus a custom-column input, used inside a popover. */
function VariableMenu({ onInsert, idPrefix }: { onInsert: (token: string) => void; idPrefix: string }) {
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  const insertCustom = () => {
    const key = custom.trim();
    if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(key)) {
      setCustomError("Use letters, numbers, dots or underscores, starting with a letter.");
      return;
    }
    setCustomError(null);
    onInsert(`{{${key}}}`);
    setCustom("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">Variables</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Filled from each lead’s columns. Add a fallback like {"{{first_name | \"there\"}}"} for empty values.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STANDARD_LEAD_FIELDS.map((field) => (
          <button key={field.key} type="button" className={chipClasses} onClick={() => onInsert(`{{${field.key}}}`)}>
            {`{{${field.key}}}`}
            <span className="sr-only">, {sentenceCase(field.label)}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-custom`}>Custom column</Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-custom`}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="icebreaker"
            autoComplete="off"
            aria-invalid={customError ? true : undefined}
            aria-describedby={customError ? `${idPrefix}-custom-error` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertCustom();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={insertCustom}>
            Insert
          </Button>
        </div>
        {customError ? (
          <p id={`${idPrefix}-custom-error`} role="alert" className="text-xs text-destructive-text">
            {customError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Compact "Variable" button that opens the full list (used next to the subject). */
export function VariablePicker({ onInsert, label = "Insert variable" }: { onInsert: (token: string) => void; label?: string }) {
  const idPrefix = useId();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          <Braces />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <VariableMenu
          idPrefix={idPrefix}
          onInsert={(token) => {
            onInsert(token);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The common variables as one-click chips, plus "More". */
export function VariableChips({ onInsert }: { onInsert: (token: string) => void }) {
  const idPrefix = useId();
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Insert a variable">
      {PRIMARY_VARS.map((key) => (
        <button key={key} type="button" className={chipClasses} onClick={() => onInsert(`{{${key}}}`)}>
          {`{{${key}}}`}
          <span className="sr-only">, {fieldLabel(key)}</span>
        </button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="xs">
            More
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <VariableMenu idPrefix={idPrefix} onInsert={onInsert} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Builds a {A|B} spin from two phrases. */
export function SpinButton({ onInsert }: { onInsert: (token: string) => void }) {
  const [a, setA] = useState("Hi");
  const [b, setB] = useState("Hello");
  const [open, setOpen] = useState(false);
  const [spinError, setSpinError] = useState<string | null>(null);

  const insert = () => {
    const left = a.replace(/[{}|]/g, "").trim();
    const right = b.replace(/[{}|]/g, "").trim();
    if (!left || !right) {
      setSpinError("Enter two different phrases.");
      return;
    }
    setSpinError(null);
    onInsert(`{${left}|${right}}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Insert spin"
              onMouseDown={(e) => e.preventDefault()}
            >
              <Shuffle />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Rotate between two phrases</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            insert();
          }}
        >
          <div>
            <p className="text-sm font-medium">Rotate a phrase</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {"{Hi|Hello}"} picks one of the phrases for each email, so not every email reads the same.
            </p>
          </div>
          <Field label="Option A">
            <Input value={a} onChange={(e) => setA(e.target.value)} />
          </Field>
          <Field label="Option B" error={spinError ?? undefined}>
            <Input value={b} onChange={(e) => setB(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" className="self-start">
            Insert
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Link popover for the formatted body. */
export function LinkButton({ onInsert }: { onInsert: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("https://");
  const [error, setError] = useState<string | null>(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Insert link"
              onMouseDown={(e) => e.preventDefault()}
            >
              <Link2 />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Link</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-72">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const safe = safeUrl(url);
            if (!safe) {
              setError("Enter an http, https or mailto link.");
              return;
            }
            setError(null);
            onInsert(safe);
            setOpen(false);
          }}
        >
          <Field label="Link URL" hint="Select text first to turn it into a link." error={error ?? undefined}>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoComplete="off" />
          </Field>
          <Button type="submit" size="sm" className="self-start">
            Add link
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@smartreach/ui";
import {
  PRESET_SEQUENCES,
  isSequenceTemplate,
  parseSequenceTemplate,
  type ReusableSequence,
} from "@/lib/sequence-templates";
import type { TemplateOpt } from "./wizard-types";
import { plural } from "./wizard-utils";

/** "Use a template" menu: replace the sequence with a saved/starter one, or drop a single email into the open step. */
export function SequenceLibrary({
  templates,
  onApplySequence,
  onApplySingle,
}: {
  templates: TemplateOpt[];
  onApplySequence: (seq: ReusableSequence) => void;
  onApplySingle: (tpl: TemplateOpt) => void;
}) {
  const [open, setOpen] = useState(false);
  const saved = useMemo(
    () => templates.filter((t) => isSequenceTemplate(t.bodyText)).map((t) => parseSequenceTemplate(t)),
    [templates],
  );
  const singles = useMemo(() => templates.filter((t) => !isSequenceTemplate(t.bodyText)), [templates]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Layers />
          Use a template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-medium text-foreground">Start from a template</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A sequence replaces all steps. A single email fills the step you have open.
          </p>
        </div>
        <div className="max-h-[min(26rem,60dvh)] overflow-y-auto py-1">
          {saved.length > 0 && (
            <Section title="Your sequences">
              {saved.map((seq) => (
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
              {singles.map((tpl) => (
                <Item
                  key={tpl.id}
                  title={tpl.name}
                  description={tpl.subject}
                  meta="Fill this step"
                  onClick={() => {
                    onApplySingle(tpl);
                    setOpen(false);
                  }}
                />
              ))}
            </Section>
          )}
        </div>
      </PopoverContent>
    </Popover>
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

function Item({
  title,
  description,
  meta,
  onClick,
}: {
  title: string;
  description?: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 px-4 py-2 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">{title}</span>
          {description ? (
            <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{description}</span>
          ) : null}
        </span>
        <span className="tabular shrink-0 pt-0.5 text-xs text-subtle-foreground">{meta}</span>
      </button>
    </li>
  );
}

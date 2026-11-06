"use client";

import { ArrowRight } from "lucide-react";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import {
  Field,
  Input,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@smartreach/ui";

export const IGNORE = "__ignore__";
export const CUSTOM = "__custom__";

/** csv column -> field key, CUSTOM, IGNORE or null (not mapped, so not imported). */
export type Mapping = Record<string, string | null>;

/** "First Name" -> "First name"; single words such as "LinkedIn" stay as they are. */
function sentenceCase(label: string) {
  return label
    .split(" ")
    .map((word, i) => (i === 0 ? word : word.toLowerCase()))
    .join(" ");
}

export function defaultCustomKey(col: string) {
  return col.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

/** Where the imported leads go: a new list or one that already exists. */
export function TargetListPicker({
  lists,
  mode,
  onModeChange,
  newListName,
  onNewListName,
  selectedListId,
  onSelectList,
  disabled,
}: {
  lists: { id: string; name: string }[];
  mode: "new" | "existing";
  onModeChange: (mode: "new" | "existing") => void;
  newListName: string;
  onNewListName: (name: string) => void;
  selectedListId: string;
  onSelectList: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <section aria-labelledby="target-list-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="target-list-heading" className="text-[15px] font-semibold tracking-[-0.01em]">
            Add leads to
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Emails already in the list are skipped, so nobody is added twice.
          </p>
        </div>
        {lists.length > 0 ? (
          <SegmentedControl
            size="sm"
            aria-label="Target list"
            value={mode}
            onValueChange={onModeChange}
            options={[
              { value: "new", label: "New list", disabled },
              { value: "existing", label: "Existing list", disabled },
            ]}
          />
        ) : null}
      </div>

      {mode === "new" ? (
        <Field
          label="New list name"
          required
          error={newListName.trim() ? undefined : "Give the new list a name"}
        >
          <Input
            value={newListName}
            maxLength={120}
            disabled={disabled}
            onChange={(e) => onNewListName(e.target.value)}
            placeholder="e.g. SaaS founders, Q1"
          />
        </Field>
      ) : (
        <Field label="List">
          <Select value={selectedListId} onValueChange={onSelectList} disabled={disabled}>
            <SelectTrigger aria-label="Select target saved list">
              <SelectValue placeholder="Choose a list" />
            </SelectTrigger>
            <SelectContent>
              {lists.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </section>
  );
}

/** One row per CSV column: its name and first value, and the field it maps to. */
export function ColumnMappingTable({
  headers,
  sample,
  mapping,
  customKeys,
  onMap,
  onCustomKey,
  disabled,
}: {
  headers: string[];
  sample: Record<string, string> | undefined;
  mapping: Mapping;
  customKeys: Record<string, string>;
  onMap: (col: string, value: string) => void;
  onCustomKey: (col: string, value: string) => void;
  disabled?: boolean;
}) {
  const usage: Record<string, number> = {};
  for (const col of headers) {
    const v = mapping[col];
    if (v && v !== IGNORE && v !== CUSTOM) usage[v] = (usage[v] ?? 0) + 1;
  }

  return (
    <div
      data-testid="column-mapping-scroll"
      className="max-h-[min(32rem,calc(100dvh-16rem))] min-w-0 max-w-full overflow-auto overscroll-x-contain rounded-xl border border-border bg-card"
    >
      <div className="sm:min-w-[40rem]">
        <div className="sticky top-0 z-10 hidden grid-cols-[minmax(0,1fr)_1rem_minmax(0,1.15fr)] items-center gap-3 border-b border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground sm:grid">
          <span>Column in your file</span>
          <span aria-hidden />
          <span>Imports as</span>
        </div>
        <ul className="divide-y divide-border">
          {headers.map((col, index) => {
            const raw = mapping[col];
            const value = raw === null || raw === undefined ? IGNORE : raw;
            const ignored = value === IGNORE;
            const duplicate = !ignored && value !== CUSTOM && (usage[value] ?? 0) > 1;
            const example = sample?.[col];
            return (
              <li
                key={`${col}-${index}`}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1.15fr)] sm:items-center sm:gap-3"
              >
                <div className="min-w-0">
                  <p className={ignored ? "truncate text-[13px] font-medium text-muted-foreground" : "truncate text-[13px] font-medium"}>
                    {col.replace(/\uFEFF/g, "") || <span className="italic">Unnamed column</span>}
                  </p>
                  <p className="truncate text-xs text-subtle-foreground">
                    {example ? example : <span className="italic">Empty in the first row</span>}
                  </p>
                </div>
                <ArrowRight className="hidden size-4 text-subtle-foreground sm:block" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Select value={value} onValueChange={(v) => onMap(col, v)} disabled={disabled}>
                        <SelectTrigger className="h-8 text-[13px]" aria-label={`Map column ${col}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4}>
                          {STANDARD_LEAD_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {sentenceCase(f.label)}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value={CUSTOM}>Custom variable</SelectItem>
                          <SelectItem value={IGNORE}>Don&apos;t import</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {value === CUSTOM ? (
                      <Input
                        className="h-8 w-36 shrink-0 font-mono text-xs"
                        placeholder="variable_name"
                        aria-label={`Custom variable for ${col}`}
                        disabled={disabled}
                        value={customKeys[col] ?? defaultCustomKey(col)}
                        onChange={(e) => onCustomKey(col, e.target.value)}
                      />
                    ) : null}
                  </div>
                  {duplicate ? (
                    <p className="text-xs text-warning-text">Another column also maps to this field.</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

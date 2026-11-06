"use client";

import * as React from "react";
import { Building2, ChevronDown, Search } from "lucide-react";
import { Badge, Checkbox, Input, Kbd, Label, Switch, cn } from "@smartreach/ui";
import type { DirectoryFacetItem, DirectoryFacets, DirectorySearchParams } from "@/lib/leads-directory";
import {
  CONTACT_TOGGLES,
  ROLE_OPTIONS,
  formatCount,
  type ContactToggleKey,
  type ListFilterKey,
} from "./directory-utils";

interface LeadFiltersPanelProps {
  facets: DirectoryFacets;
  filters: DirectorySearchParams;
  /** Merge a patch into the filters. The parent resets the page and re-runs the search. */
  onChange: (patch: Partial<DirectorySearchParams>) => void;
  /** Ref for the keyword input, so the parent can focus it with "/". */
  searchInputRef?: React.Ref<HTMLInputElement>;
  /** Show the "/" shortcut hint in the keyword field. */
  showShortcut?: boolean;
  className?: string;
}

/** The filter controls. The parent places them in the desktop rail or the mobile sheet. */
export function LeadFiltersPanel({
  facets,
  filters,
  onChange,
  searchInputRef,
  showShortcut,
  className,
}: LeadFiltersPanelProps) {
  const toggleValue = (key: ListFilterKey, value: string) => {
    const current = filters[key] || [];
    onChange({
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    } as Partial<DirectorySearchParams>);
  };

  const contactCount = CONTACT_TOGGLES.filter((t) => filters[t.key]).length;

  return (
    <div className={cn("flex flex-col divide-y divide-border", className)}>
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            type="search"
            aria-label="Search by name, title or keyword"
            placeholder="Name, title or keyword"
            value={filters.query || ""}
            onChange={(e) => onChange({ query: e.target.value })}
            className={cn("pl-9", showShortcut && "pr-9")}
          />
          {showShortcut && !filters.query ? (
            <Kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">/</Kbd>
          ) : null}
        </div>
        <div className="relative">
          <Building2
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Company name or domain"
            placeholder="Company name or domain"
            value={filters.companyName || ""}
            onChange={(e) => onChange({ companyName: e.target.value })}
            className="pl-9"
          />
        </div>
      </div>

      <FilterSection title="Role" count={filters.jobTitles?.length}>
        <OptionList
          name="Role"
          items={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={filters.jobTitles || []}
          onToggle={(v) => toggleValue("jobTitles", v)}
        />
      </FilterSection>

      <FilterSection title="Industry" count={filters.industries?.length}>
        <OptionList
          name="Industry"
          searchable
          items={facets.industries}
          selected={filters.industries || []}
          onToggle={(v) => toggleValue("industries", v)}
        />
      </FilterSection>

      <FilterSection title="Country" count={filters.countries?.length}>
        <OptionList
          name="Country"
          searchable
          items={facets.countries}
          selected={filters.countries || []}
          onToggle={(v) => toggleValue("countries", v)}
        />
      </FilterSection>

      <FilterSection title="Company size" count={filters.teamSizes?.length}>
        <OptionList
          name="Company size"
          items={facets.teamSizes}
          selected={filters.teamSizes || []}
          onToggle={(v) => toggleValue("teamSizes", v)}
        />
      </FilterSection>

      <FilterSection title="Annual revenue" count={filters.revenueRanges?.length} defaultOpen={false}>
        <OptionList
          name="Annual revenue"
          items={facets.revenueRanges}
          selected={filters.revenueRanges || []}
          onToggle={(v) => toggleValue("revenueRanges", v)}
        />
      </FilterSection>

      <FilterSection title="Contact details" count={contactCount}>
        <p className="mb-2 px-2 text-xs text-muted-foreground">Only show people who have:</p>
        <ul className="flex flex-col">
          {CONTACT_TOGGLES.map((t) => (
            <ContactToggle
              key={t.key}
              id={t.key}
              label={t.label}
              checked={!!filters[t.key]}
              onChange={(c) => onChange({ [t.key]: c } as Partial<Record<ContactToggleKey, boolean>>)}
            />
          ))}
        </ul>
      </FilterSection>
    </div>
  );
}

function FilterSection({
  title,
  count = 0,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen || count > 0);
  const id = React.useId();
  return (
    <section className="px-2 py-2">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <span className="flex-1">{title}</span>
          {count > 0 ? (
            <Badge variant="solid" aria-label={`${count} selected`}>
              {count}
            </Badge>
          ) : null}
          <ChevronDown
            className={cn("size-4 text-subtle-foreground transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </h3>
      <div id={id} hidden={!open} className="pb-2 pt-1">
        {children}
      </div>
    </section>
  );
}

const VISIBLE = 8;

function OptionList({
  name,
  items,
  selected,
  onToggle,
  searchable,
}: {
  name: string;
  items: (Pick<DirectoryFacetItem, "value" | "label"> & { count?: number })[];
  selected: string[];
  onToggle: (value: string) => void;
  searchable?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [expanded, setExpanded] = React.useState(false);

  if (items.length === 0) {
    return <p className="px-2 py-1.5 text-xs text-muted-foreground">No options in the directory yet.</p>;
  }

  const needle = q.trim().toLowerCase();
  const matches = items.filter((i) => !needle || i.label.toLowerCase().includes(needle));
  // Selected values stay at the top so they are easy to find and remove.
  const ordered = [...matches.filter((i) => selected.includes(i.value)), ...matches.filter((i) => !selected.includes(i.value))];
  const limit = Math.max(VISIBLE, selected.length);
  const shown = expanded || needle ? ordered : ordered.slice(0, limit);
  const hidden = ordered.length - shown.length;

  return (
    <div className="flex flex-col gap-1.5">
      {searchable && items.length > VISIBLE ? (
        <div className="px-2 pb-1">
          <Input
            type="search"
            aria-label={`Search ${name.toLowerCase()} options`}
            placeholder={`Search ${name.toLowerCase()}`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 text-[13px]"
          />
        </div>
      ) : null}
      <ul className={cn("flex flex-col", expanded && "max-h-72 overflow-y-auto")} aria-label={name}>
        {shown.map((item) => {
          const checked = selected.includes(item.value);
          return (
            <li key={item.value}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-muted">
                <Checkbox checked={checked} onCheckedChange={() => onToggle(item.value)} />
                <span className={cn("min-w-0 flex-1 truncate", checked ? "text-foreground" : "text-muted-foreground")}>
                  {item.label}
                </span>
                {typeof item.count === "number" ? (
                  <span className="tabular shrink-0 text-xs text-subtle-foreground">{formatCount(item.count)}</span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 ? <p className="px-2 py-1.5 text-xs text-muted-foreground">No matches for “{q}”.</p> : null}
      {!needle && ordered.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="self-start rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {expanded ? "Show fewer" : `Show ${hidden.toLocaleString()} more`}
        </button>
      ) : null}
    </div>
  );
}

function ContactToggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const inputId = `${React.useId()}-${id}`;
  return (
    <li className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
      <Label htmlFor={inputId} className="flex-1 cursor-pointer font-normal text-muted-foreground">
        {label}
      </Label>
      <Switch id={inputId} size="sm" checked={checked} onCheckedChange={onChange} />
    </li>
  );
}

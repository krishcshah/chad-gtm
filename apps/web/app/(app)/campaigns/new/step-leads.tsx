"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, Search, Users } from "lucide-react";
import { Alert, Button, EmptyState, Input, cn } from "@smartreach/ui";
import type { LeadListOpt } from "./wizard-types";
import { plural } from "./wizard-utils";

const SEARCH_THRESHOLD = 7;

export function StepLeads({
  leadLists,
  leadListId,
  error,
  onSelect,
}: {
  leadLists: LeadListOpt[];
  leadListId: string;
  error?: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leadLists;
    return leadLists.filter((l) => l.name.toLowerCase().includes(q));
  }, [leadLists, query]);
  const selected = leadLists.find((l) => l.id === leadListId);

  if (leadLists.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No lead lists yet"
        description="Add leads to a list first. Your progress here is kept if you save a draft."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/leads">Go to lead lists</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {leadLists.length >= SEARCH_THRESHOLD && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lists"
            aria-label="Search lead lists"
            className="pl-9"
          />
        </div>
      )}

      <div
        id="lead-list-group"
        tabIndex={-1}
        role="group"
        aria-label="Lead lists"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "lead-list-group-error" : undefined}
        className={cn(
          "overflow-hidden rounded-lg border outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
          error ? "border-destructive" : "border-border",
        )}
      >
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No lists match “{query}”.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((l) => {
              const isSelected = leadListId === l.id;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelect(l.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors",
                      "focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring",
                      isSelected ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong bg-card",
                      )}
                    >
                      {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{l.name}</span>
                    <span
                      className={cn(
                        "tabular shrink-0 text-[13px]",
                        l.leadCount === 0 ? "text-warning-text" : "text-muted-foreground",
                      )}
                    >
                      {l.leadCount === 0 ? "No leads yet" : plural(l.leadCount, "lead")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error ? (
        <p id="lead-list-group-error" className="text-xs text-destructive-text">
          {error}
        </p>
      ) : null}

      {selected && selected.leadCount === 0 ? (
        <Alert variant="warning">
          “{selected.name}” has no leads yet. You can still continue, but the campaign has nobody to email until
          leads are added.
        </Alert>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        Need a different audience?{" "}
        <Link
          href="/leads"
          className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
        >
          Manage lead lists
        </Link>
      </p>
    </div>
  );
}

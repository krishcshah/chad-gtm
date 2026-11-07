"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Search, Users } from "lucide-react";
import { Alert, Button, Checkbox, EmptyState, Input, Label, cn } from "@smartreach/ui";
import type { LeadListOpt } from "./wizard-types";
import { plural } from "./wizard-utils";

const SEARCH_THRESHOLD = 7;

export function StepLeads({
  leadLists,
  leadListId,
  error,
  onSelect,
  reengageContacted = false,
  onReengageContactedChange,
}: {
  leadLists: LeadListOpt[];
  leadListId: string;
  error?: string;
  onSelect: (id: string) => void;
  /** "Email them again": include leads your other campaigns already emailed. */
  reengageContacted?: boolean;
  onReengageContactedChange?: (checked: boolean) => void;
}) {
  const reengageId = useId();
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return leadLists;
    return leadLists.filter((l) => l.name.toLowerCase().includes(q));
  }, [leadLists, query]);
  const selected = leadLists.find((l) => l.id === leadListId);
  // How many leads this campaign would email (null when the counts are unknown).
  const sendable = selected?.sendableCount ?? null;
  const contacted = selected?.contactedCount ?? 0;
  const effectiveCount =
    selected == null
      ? null
      : sendable == null
        ? selected.leadCount
        : sendable + (reengageContacted ? contacted : 0);

  if (leadLists.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No lead lists yet"
        description="Add leads to a list first. Your progress here is kept if you save a draft."
        action={
          <Button size="sm" variant="outline" asChild>
            <Link href="/leads/new">Create a lead list</Link>
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
                      {l.leadCount === 0
                        ? "No leads yet"
                        : l.sendableCount != null && l.sendableCount !== l.leadCount
                          ? `${l.sendableCount.toLocaleString()} sendable of ${plural(l.leadCount, "lead")}`
                          : plural(l.leadCount, "lead")}
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

      {selected && sendable != null && selected.leadCount > 0 ? (
        <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
          <p>
            <span className="tabular font-medium text-foreground">{(effectiveCount ?? 0).toLocaleString()}</span> of{" "}
            <span className="tabular">{selected.leadCount.toLocaleString()}</span> leads will be emailed.
          </p>
          {contacted > 0 ? (
            <>
              <p>
                {contacted.toLocaleString()} {contacted === 1 ? "was" : "were"} already emailed by your other campaigns
                and {reengageContacted ? "will be emailed again." : "are left out."}
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={reengageId}
                  checked={reengageContacted}
                  onCheckedChange={(v) => onReengageContactedChange?.(v === true)}
                />
                <Label htmlFor={reengageId} className="font-normal text-foreground">
                  Email them again
                </Label>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {selected && selected.leadCount === 0 ? (
        <Alert variant="warning">
          “{selected.name}” has no leads yet. You can still continue, but the campaign has nobody to email until
          leads are added.
        </Alert>
      ) : selected && effectiveCount === 0 ? (
        <Alert variant="warning">
          Nobody in “{selected.name}” can be emailed right now: they were already emailed, are in another running
          campaign, or are on your blocklist. Pick another list or add new leads.
        </Alert>
      ) : null}

      <p className="text-[13px] text-muted-foreground">
        Need a different audience?{" "}
        <Link
          href="/leads/new"
          className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
        >
          Create a new lead list
        </Link>
      </p>
    </div>
  );
}

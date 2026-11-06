"use client";

import * as React from "react";
import { ExternalLink, Linkedin, SearchX } from "lucide-react";
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Skeleton,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@smartreach/ui";
import type { DirectoryLead } from "@/lib/leads-directory";
import { CopyButton } from "./copy-button";
import { displayDomain, emailKind, externalUrl, leadLocation, leadName } from "./directory-utils";

interface LeadsDataTableProps {
  leads: DirectoryLead[];
  pageSize: number;
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  selectedLeadIds: Set<number>;
  isSelectAllMatching: boolean;
  onSelectLead: (id: number) => void;
  /** Header checkbox: select or clear every row on this page. */
  onTogglePage: () => void;
  onViewLeadDetails: (lead: DirectoryLead) => void;
  hasFilters: boolean;
  onClearFilters: () => void;
}

const COLUMNS = [
  { key: "name", label: "Name", className: "min-w-[220px]" },
  { key: "company", label: "Company", className: "min-w-[200px]" },
  { key: "email", label: "Email", className: "min-w-[250px]" },
  { key: "phone", label: "Phone", className: "min-w-[150px]" },
  { key: "location", label: "Location", className: "min-w-[160px]" },
  { key: "size", label: "Employees", className: "min-w-[100px]" },
  { key: "revenue", label: "Revenue", className: "min-w-[110px]" },
  { key: "linkedin", label: <span className="sr-only">LinkedIn</span>, className: "w-12" },
] as const;

const stickyHead = "sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--color-border)]";

/** Results grid: sticky header, row selection, click a row to open the record. */
export function LeadsDataTable({
  leads,
  pageSize,
  isLoading,
  error,
  onRetry,
  selectedLeadIds,
  isSelectAllMatching,
  onSelectLead,
  onTogglePage,
  onViewLeadDetails,
  hasFilters,
  onClearFilters,
}: LeadsDataTableProps) {
  if (error && !isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorState title="Search failed" description={error} onRetry={onRetry} />
      </div>
    );
  }

  const pageSelectedCount = leads.filter((l) => selectedLeadIds.has(l.id)).length;
  const allOnPage = isSelectAllMatching || (leads.length > 0 && pageSelectedCount === leads.length);
  const headerChecked: boolean | "indeterminate" = allOnPage ? true : pageSelectedCount > 0 ? "indeterminate" : false;

  if (!isLoading && leads.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          icon={SearchX}
          title={hasFilters ? "No one matches these filters" : "The directory is empty"}
          description={
            hasFilters
              ? "Remove a filter or two to widen the search."
              : "Contacts appear here once the directory has been imported."
          }
          action={
            hasFilters ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear all filters
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <table className="w-full min-w-[1160px] border-collapse text-[13px]" aria-busy={isLoading || undefined}>
      <caption className="sr-only">Directory contacts. Select rows to add them to a lead list.</caption>
      <TableHeader className="bg-transparent [&_tr]:border-0">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(stickyHead, "w-10 pr-0")}>
            <Checkbox
              checked={headerChecked}
              onCheckedChange={onTogglePage}
              disabled={isLoading || leads.length === 0}
              aria-label={allOnPage ? "Clear selection on this page" : "Select all on this page"}
            />
          </TableHead>
          {COLUMNS.map((c) => (
            <TableHead key={c.key} scope="col" className={cn(stickyHead, c.className)}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading
          ? Array.from({ length: Math.min(pageSize, 12) }).map((_, i) => <SkeletonRow key={i} />)
          : leads.map((lead) => (
              <LeadRow
                key={lead.id}
                lead={lead}
                selected={isSelectAllMatching || selectedLeadIds.has(lead.id)}
                onSelect={() => onSelectLead(lead.id)}
                onOpen={() => onViewLeadDetails(lead)}
              />
            ))}
      </TableBody>
    </table>
  );
}

function LeadRow({
  lead,
  selected,
  onSelect,
  onOpen,
}: {
  lead: DirectoryLead;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const name = leadName(lead);
  const kind = emailKind(lead);
  const location = leadLocation(lead);

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      className="group cursor-pointer"
      onClick={(e) => {
        // Clicks on links, buttons and the checkbox do their own thing.
        const target = e.target as HTMLElement;
        if (target.closest("a,button,input,label")) return;
        // A near miss around the checkbox selects the row instead of opening it.
        if (target.closest("[data-select-cell]")) return onSelect();
        onOpen();
      }}
    >
      <TableCell data-select-cell className="w-10 py-2.5 pr-0">
        <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Select ${name}`} />
      </TableCell>

      <TableCell className="max-w-[260px] py-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="block max-w-full truncate rounded-sm text-left font-medium text-foreground outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {name}
        </button>
        {lead.jobTitle ? <p className="truncate text-xs text-subtle-foreground">{lead.jobTitle}</p> : null}
      </TableCell>

      <TableCell className="max-w-[240px] py-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-foreground">{lead.companyName || <Dash />}</span>
          {lead.companyWebsite ? (
            <a
              href={externalUrl(lead.companyWebsite)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${displayDomain(lead.companyWebsite)} in a new tab`}
              title={displayDomain(lead.companyWebsite)}
              className="shrink-0 rounded-sm p-0.5 text-subtle-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
        {lead.industry ? <p className="truncate text-xs text-subtle-foreground">{lead.industry}</p> : null}
      </TableCell>

      <TableCell className="py-2.5">
        {lead.email ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-foreground">{lead.email}</span>
            {kind ? <span className="shrink-0 text-xs text-subtle-foreground">{kind}</span> : null}
            {lead.emailCount > 1 ? (
              <span
                className="tabular shrink-0 text-xs text-subtle-foreground"
                title={`${lead.emailCount} email addresses. Open the contact to see all of them.`}
              >
                +{lead.emailCount - 1}
              </span>
            ) : null}
            <CopyButton
              value={lead.email}
              label="email"
              className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            />
          </div>
        ) : (
          <Dash />
        )}
      </TableCell>

      <TableCell className="py-2.5">
        {lead.phone ? (
          <div className="flex items-center gap-1.5">
            <span className="tabular whitespace-nowrap text-foreground">{lead.phone}</span>
            {lead.phoneCount > 1 ? (
              <span className="tabular text-xs text-subtle-foreground" title={`${lead.phoneCount} phone numbers`}>
                +{lead.phoneCount - 1}
              </span>
            ) : null}
            <CopyButton
              value={lead.phone}
              label="phone number"
              className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
            />
          </div>
        ) : (
          <Dash />
        )}
      </TableCell>

      <TableCell className="max-w-[200px] truncate py-2.5 text-muted-foreground">{location || <Dash />}</TableCell>
      <TableCell className="tabular whitespace-nowrap py-2.5 text-muted-foreground">{lead.teamSize || <Dash />}</TableCell>
      <TableCell className="whitespace-nowrap py-2.5 text-muted-foreground">{lead.revenueRange || <Dash />}</TableCell>

      <TableCell className="w-12 py-2.5">
        {lead.linkedinUrl ? (
          <Button asChild variant="ghost" size="icon-xs">
            <a
              href={externalUrl(lead.linkedinUrl)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name} on LinkedIn`}
              title="LinkedIn profile"
            >
              <Linkedin />
            </a>
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function Dash() {
  return (
    <span className="text-subtle-foreground">
      <span aria-hidden>–</span>
      <span className="sr-only">None</span>
    </span>
  );
}

function SkeletonRow() {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="w-10 py-3 pr-0">
        <Skeleton className="size-4" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="mt-1.5 h-3 w-24" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="mt-1.5 h-3 w-20" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-44" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-24" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-24" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-12" />
      </TableCell>
      <TableCell className="py-3">
        <Skeleton className="h-3.5 w-16" />
      </TableCell>
      <TableCell className="py-3" />
    </TableRow>
  );
}

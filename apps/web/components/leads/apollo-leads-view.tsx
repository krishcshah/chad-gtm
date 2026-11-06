"use client";

import * as React from "react";
import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import {
  Button,
  PageHeader,
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  toast,
} from "@smartreach/ui";
import type {
  DirectoryFacets,
  DirectoryLead,
  DirectorySearchParams,
  DirectorySearchResult,
} from "@/lib/leads-directory";
import { exportMatchingDirectoryLeadsCsvAction, searchDirectoryLeadsAction } from "@/lib/actions";
import { AddToCampaignDialog } from "./add-to-campaign-dialog";
import { DirectoryPagination } from "./directory-pagination";
import { DirectoryToolbar } from "./directory-toolbar";
import {
  activeFilterChips,
  countActiveFilters,
  downloadCsv,
  emptyDirectoryFilters,
  leadsToCsv,
  type ActiveFilterChip,
} from "./directory-utils";
import { LeadDetailsSheet } from "./lead-details-sheet";
import { LeadFiltersPanel } from "./lead-filters-panel";
import { LeadsDataTable } from "./leads-data-table";

interface ExistingListOption {
  id: string;
  name: string;
  leadCount: number;
  createdAt: string;
}

interface ApolloLeadsViewProps {
  initialResult: DirectorySearchResult;
  initialFacets: DirectoryFacets;
  existingLists: ExistingListOption[];
  /** Extra row under the page description (the admin access note). */
  meta?: React.ReactNode;
  /** Most rows one "add to list" can copy for this account. */
  saveLimit?: number;
  /** Most rows one "export all matches" can download for this account. */
  exportLimit?: number;
}

const SEARCH_DEBOUNCE_MS = 350;

type AddTarget = { leadIds: number[]; allMatching: boolean; single: boolean };

/** The B2B directory: filter rail, results table, record sheet and bulk actions. */
export function ApolloLeadsView({
  initialResult,
  initialFacets,
  existingLists,
  meta,
  saveLimit,
  exportLimit,
}: ApolloLeadsViewProps) {
  const facets = initialFacets;
  const [result, setResult] = React.useState<DirectorySearchResult>(initialResult);
  const [filters, setFilters] = React.useState<DirectorySearchParams>(() =>
    emptyDirectoryFilters(initialResult.pageSize || 25),
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Selection. Selected rows are kept with their data so an export works across pages.
  const [selected, setSelected] = React.useState<Map<number, DirectoryLead>>(new Map());
  const [isSelectAllMatching, setIsSelectAllMatching] = React.useState(false);
  const selectedLeadIds = React.useMemo(() => new Set(selected.keys()), [selected]);

  const [inspectingLead, setInspectingLead] = React.useState<DirectoryLead | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [addTarget, setAddTarget] = React.useState<AddTarget | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  // The filters behind the rows on screen: used for "all matches" saves and exports.
  const appliedFilters = React.useRef<DirectorySearchParams>(filters);
  const requestId = React.useRef(0);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const runSearch = React.useCallback(async (params: DirectorySearchParams) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const id = ++requestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const res = await searchDirectoryLeadsAction(params);
      if (id !== requestId.current) return; // a newer search is on its way
      if (res.ok && res.data) {
        setResult(res.data);
        appliedFilters.current = params;
      } else {
        setError(res.ok ? "The search returned nothing." : res.error || "The directory search failed.");
      }
    } catch {
      if (id === requestId.current) setError("Could not reach the directory. Check your connection and try again.");
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, []);

  React.useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  const clearSelection = React.useCallback(() => {
    setSelected(new Map());
    setIsSelectAllMatching(false);
  }, []);

  /** Filter edits go back to page 1 and search after a short pause. */
  const updateFilters = (patch: Partial<DirectorySearchParams>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
    clearSelection();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      // Rows ticked on the old results during the pause no longer match these filters.
      clearSelection();
      void runSearch(next);
    }, SEARCH_DEBOUNCE_MS);
  };

  const resetFilters = () => {
    const next = emptyDirectoryFilters(filters.pageSize || 25);
    setFilters(next);
    clearSelection();
    void runSearch(next);
  };

  const handlePageChange = (page: number) => {
    const next = { ...filters, page };
    setFilters(next);
    void runSearch(next);
  };

  const handlePageSizeChange = (pageSize: number) => {
    const next = { ...filters, pageSize, page: 1 };
    setFilters(next);
    clearSelection();
    void runSearch(next);
  };

  const handleSelectLead = (id: number) => {
    if (isSelectAllMatching) {
      // Leaving "every match" mode: keep this page minus the row just unticked.
      setSelected(new Map(result.leads.filter((l) => l.id !== id).map((l) => [l.id, l])));
      setIsSelectAllMatching(false);
      return;
    }
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else {
        const lead = result.leads.find((l) => l.id === id);
        if (lead) next.set(id, lead);
      }
      return next;
    });
  };

  const pageSelectedCount = result.leads.filter((l) => selectedLeadIds.has(l.id)).length;
  const allPageSelected = result.leads.length > 0 && pageSelectedCount === result.leads.length;

  const handleTogglePage = () => {
    if (isSelectAllMatching) return clearSelection();
    setSelected((prev) => {
      const next = new Map(prev);
      if (allPageSelected) result.leads.forEach((l) => next.delete(l.id));
      else result.leads.forEach((l) => next.set(l.id, l));
      return next;
    });
  };

  const handleSelectAllMatching = () => {
    setSelected(new Map(result.leads.map((l) => [l.id, l])));
    setIsSelectAllMatching(true);
  };

  const handleExport = async () => {
    if (isSelectAllMatching) {
      setIsExporting(true);
      try {
        const res = await exportMatchingDirectoryLeadsCsvAction(appliedFilters.current);
        if (!res.ok) toast.error(res.error || "Export failed");
        else if (res.data) {
          downloadCsv(res.data.csv, res.data.filename);
          const capped = exportLimit !== undefined && result.total > res.data.count;
          toast.success(
            `Exported ${res.data.count.toLocaleString()} ${res.data.count === 1 ? "person" : "people"}`,
            capped ? { description: `Exports stop at ${res.data.count.toLocaleString()} rows. Narrow your filters for the rest.` } : undefined,
          );
        }
      } catch (err: any) {
        toast.error(err?.message || "Export failed");
      } finally {
        setIsExporting(false);
      }
      return;
    }

    const rows = selected.size > 0 ? Array.from(selected.values()) : result.leads;
    if (rows.length === 0) {
      toast.error("No leads to export");
      return;
    }
    downloadCsv(leadsToCsv(rows), `directory-export-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`Exported ${rows.length.toLocaleString()} ${rows.length === 1 ? "person" : "people"}`);
  };

  // "/" focuses the keyword search, like most search tools.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input,textarea,select,[contenteditable=true]") || t.isContentEditable)) return;
      // Leave the key alone while a dialog or sheet is open over the page.
      if (t?.closest('[role="dialog"],[role="alertdialog"]') || document.querySelector('[role="dialog"][data-state="open"]')) return;
      const input = searchInputRef.current;
      if (!input || input.offsetParent === null) return; // rail hidden on small screens
      e.preventDefault();
      input.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const chips = activeFilterChips(filters, facets);
  const activeCount = countActiveFilters(filters);
  const removeChip = (chip: ActiveFilterChip) => updateFilters(chip.remove(filters));

  const openAdd = (target: AddTarget) => {
    setAddTarget(target);
    setAddOpen(true);
  };
  const openAddForSelection = () =>
    openAdd({ leadIds: Array.from(selected.keys()), allMatching: isSelectAllMatching, single: false });

  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-5 sm:px-6 lg:py-6">
        <PageHeader
          title="B2B directory"
          description={`Search ${facets.totalLeads.toLocaleString()} business contacts, then add the right people to a lead list for your campaigns.`}
          meta={meta}
          actions={
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/campaigns">
                  <ListChecks />
                  Campaigns & leads
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/campaigns/new">
                  <Plus />
                  New campaign
                </Link>
              </Button>
            </>
          }
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Filters"
          className="hidden w-72 shrink-0 flex-col border-r border-border bg-card lg:flex"
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
            <h2 className="text-[13px] font-semibold text-foreground">Filters</h2>
            {activeCount > 0 ? (
              <Button variant="ghost" size="xs" onClick={resetFilters}>
                Clear all
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <LeadFiltersPanel
              facets={facets}
              filters={filters}
              onChange={updateFilters}
              searchInputRef={searchInputRef}
              showShortcut
            />
          </div>
        </aside>

        <section aria-label="Results" className="flex min-w-0 flex-1 flex-col">
          <DirectoryToolbar
            total={result.total}
            isLoading={isLoading}
            chips={chips}
            onRemoveChip={removeChip}
            onClearFilters={resetFilters}
            onOpenFilters={() => setFiltersOpen(true)}
            selectedCount={selected.size}
            isSelectAllMatching={isSelectAllMatching}
            pageCount={result.leads.length}
            allPageSelected={allPageSelected}
            onSelectAllMatching={handleSelectAllMatching}
            onClearSelection={clearSelection}
            onExport={handleExport}
            isExporting={isExporting}
            exportDisabled={isLoading || (selected.size === 0 && !isSelectAllMatching && result.leads.length === 0)}
            onAddToList={openAddForSelection}
          />

          <div className="min-h-0 flex-1 overflow-auto bg-card">
            <LeadsDataTable
              leads={result.leads}
              pageSize={filters.pageSize || result.pageSize}
              isLoading={isLoading}
              error={error}
              onRetry={() => void runSearch(filters)}
              selectedLeadIds={selectedLeadIds}
              isSelectAllMatching={isSelectAllMatching}
              onSelectLead={handleSelectLead}
              onTogglePage={handleTogglePage}
              onViewLeadDetails={(lead) => {
                setInspectingLead(lead);
                setDetailsOpen(true);
              }}
              hasFilters={activeCount > 0}
              onClearFilters={resetFilters}
            />
          </div>

          {result.total > 0 && !error ? (
            <DirectoryPagination
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
              totalPages={result.totalPages}
              isLoading={isLoading}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
            />
          ) : null}
        </section>
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Results update as you change filters.</SheetDescription>
          </SheetHeader>
          <SheetBody className="px-0 py-0">
            <LeadFiltersPanel facets={facets} filters={filters} onChange={updateFilters} />
          </SheetBody>
          <SheetFooter className="justify-between">
            <Button variant="ghost" onClick={resetFilters} disabled={activeCount === 0}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)} loading={isLoading}>
              Show {result.total.toLocaleString()} {result.total === 1 ? "person" : "people"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <LeadDetailsSheet
        lead={inspectingLead}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onAddToList={(id) => openAdd({ leadIds: [id], allMatching: false, single: true })}
      />

      <AddToCampaignDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        selectedLeadIds={addTarget?.leadIds ?? []}
        isSelectAllMatching={addTarget?.allMatching ?? false}
        totalMatchingCount={result.total}
        searchParams={appliedFilters.current}
        existingLists={existingLists}
        saveLimit={saveLimit}
        onSuccess={() => {
          if (!addTarget?.single) clearSelection();
        }}
      />
    </>
  );
}

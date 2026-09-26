"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@smartreach/ui";
import {
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  Plus,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import type {
  DirectoryFacets,
  DirectoryLead,
  DirectorySearchParams,
  DirectorySearchResult,
} from "@/lib/leads-directory";
import {
  searchDirectoryLeadsAction,
  getDirectoryFacetsAction,
  exportMatchingDirectoryLeadsCsvAction,
} from "@/lib/actions";
import { LeadFiltersPanel } from "./lead-filters-panel";
import { LeadsDataTable } from "./leads-data-table";
import { LeadDetailsSheet } from "./lead-details-sheet";
import { AddToCampaignDialog } from "./add-to-campaign-dialog";
import { LeadListCard } from "@/app/(app)/leads/lead-list-card";
import { toast } from "sonner";

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
  workspaceName: string;
}

export function ApolloLeadsView({
  initialResult,
  initialFacets,
  existingLists,
  workspaceName,
}: ApolloLeadsViewProps) {
  const [activeTab, setActiveTab] = useState<"directory" | "saved-lists">("directory");

  // Lead Directory state
  const [facets, setFacets] = useState<DirectoryFacets>(initialFacets);
  const [searchResult, setSearchResult] = useState<DirectorySearchResult>(initialResult);
  const [filters, setFilters] = useState<DirectorySearchParams>({
    query: "",
    industries: [],
    countries: [],
    jobTitles: [],
    companyName: "",
    teamSizes: [],
    revenueRanges: [],
    hasEmail: false,
    hasPhone: false,
    hasLinkedin: false,
    page: 1,
    pageSize: 10,
    sortBy: "default",
    sortOrder: "desc",
  });

  const [isLoading, startTransition] = useTransition();

  // Selected leads
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());
  const [isSelectAllMatching, setIsSelectAllMatching] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Modal states
  const [inspectingLead, setInspectingLead] = useState<DirectoryLead | null>(null);
  const [isAddToListOpen, setIsAddToListOpen] = useState(false);

  // Measure table container height to perfectly match the filter panel height on desktop
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el.offsetHeight > 0) {
        setTableHeight(el.offsetHeight);
      }
    };

    updateHeight();

    const ro = new ResizeObserver(() => {
      updateHeight();
    });
    ro.observe(el);

    return () => ro.disconnect();
  }, [searchResult.leads.length, isLoading]);

  // Trigger directory search query
  const executeSearch = (overrideParams?: Partial<DirectorySearchParams>) => {
    const params: DirectorySearchParams = {
      ...filters,
      ...overrideParams,
    };

    startTransition(async () => {
      try {
        const res = await searchDirectoryLeadsAction(params);
        if (res.ok) {
          if (res.data) {
            setSearchResult(res.data);
          }
        } else {
          toast.error(res.error || "Failed to search leads directory");
        }
      } catch (err: any) {
        toast.error("Failed to query leads database");
      }
    });
  };

  const handleApplyFilters = () => {
    setSelectedLeadIds(new Set());
    setIsSelectAllMatching(false);
    executeSearch({ page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
    executeSearch({ page: newPage });
  };

  const handlePageSizeChange = (newSize: number) => {
    setSelectedLeadIds(new Set());
    setIsSelectAllMatching(false);
    setFilters((prev) => ({ ...prev, pageSize: newSize, page: 1 }));
    executeSearch({ pageSize: newSize, page: 1 });
  };

  const handleSelectLead = (id: number) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (isSelectAllMatching) {
        searchResult.leads.forEach((l) => next.add(l.id));
        next.delete(id);
        setIsSelectAllMatching(false);
        return next;
      }
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectCurrentPage = () => {
    const currentPageIds = searchResult.leads.map((l) => l.id);
    setSelectedLeadIds(new Set(currentPageIds));
    setIsSelectAllMatching(false);
    toast.info(`Selected ${currentPageIds.length} leads on this page`);
  };

  const handleSelectAllMatching = () => {
    const currentPageIds = searchResult.leads.map((l) => l.id);
    setSelectedLeadIds(new Set(currentPageIds));
    setIsSelectAllMatching(true);
    toast.success(`Selected all ${searchResult.total.toLocaleString()} leads in this list`);
  };

  const handleClearSelection = () => {
    setSelectedLeadIds(new Set());
    setIsSelectAllMatching(false);
  };

  const handleSelectAll = () => {
    if (isSelectAllMatching) {
      handleClearSelection();
      return;
    }
    const currentPageIds = searchResult.leads.map((l) => l.id);
    const allSelected =
      currentPageIds.length > 0 && currentPageIds.every((id) => selectedLeadIds.has(id));

    if (allSelected) {
      handleClearSelection();
    } else {
      handleSelectCurrentPage();
    }
  };

  // Export current view or selected leads as CSV
  const handleExportCsv = async () => {
    if (isSelectAllMatching) {
      try {
        setIsExporting(true);
        toast.info(`Preparing full CSV export for all matching leads...`);
        const res = await exportMatchingDirectoryLeadsCsvAction(filters);
        if (!res.ok) {
          toast.error(res.error || "Failed to export CSV");
        } else if (res.data) {
          const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", res.data.filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success(`Exported all ${res.data.count.toLocaleString()} matching leads to CSV`);
        }
      } catch (err: any) {
        toast.error(err?.message || "Failed to export leads");
      } finally {
        setIsExporting(false);
      }
      return;
    }

    const leadsToExport =
      selectedLeadIds.size > 0
        ? searchResult.leads.filter((l) => selectedLeadIds.has(l.id))
        : searchResult.leads;

    if (leadsToExport.length === 0) {
      toast.error("No leads to export");
      return;
    }

    const headers = [
      "Full Name",
      "First Name",
      "Last Name",
      "Job Title",
      "Company Name",
      "Company Website",
      "Primary Email",
      "Email Status",
      "Phone",
      "Industry",
      "Country",
      "City",
      "State",
      "Team Size",
      "Revenue Range",
      "LinkedIn URL",
    ];

    const rows = leadsToExport.map((l) => [
      `"${(l.fullName || "").replace(/"/g, '""')}"`,
      `"${(l.firstName || "").replace(/"/g, '""')}"`,
      `"${(l.lastName || "").replace(/"/g, '""')}"`,
      `"${(l.jobTitle || "").replace(/"/g, '""')}"`,
      `"${(l.companyName || "").replace(/"/g, '""')}"`,
      `"${(l.companyWebsite || "").replace(/"/g, '""')}"`,
      `"${(l.email || "").replace(/"/g, '""')}"`,
      `"${(l.emailStatus || "").replace(/"/g, '""')}"`,
      `"${(l.phone || "").replace(/"/g, '""')}"`,
      `"${(l.industry || "").replace(/"/g, '""')}"`,
      `"${(l.country || "").replace(/"/g, '""')}"`,
      `"${(l.city || "").replace(/"/g, '""')}"`,
      `"${(l.state || "").replace(/"/g, '""')}"`,
      `"${(l.teamSize || "").replace(/"/g, '""')}"`,
      `"${(l.revenueRange || "").replace(/"/g, '""')}"`,
      `"${(l.linkedinUrl || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `smartreach_leads_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Exported ${leadsToExport.length} leads to CSV`);
  };

  const totalSavedLeads = existingLists.reduce((acc, l) => acc + Number(l.leadCount || 0), 0);

  return (
    <div className="apollo-leads-root space-y-5 w-full max-w-full min-w-0">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-5 w-full max-w-full min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Leads & Prospect Intelligence
            </h1>
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20 text-xs font-semibold px-2 py-0.5 whitespace-nowrap"
            >
              {facets.totalLeads.toLocaleString()} Leads Database
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Search verified contacts, filter by industry & location, and import directly into {workspaceName} campaigns.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" asChild className="gap-1.5 shadow-sm text-xs font-semibold">
            <Link href="/campaigns/new">
              <Sparkles className="h-4 w-4" />
              Launch Campaign
            </Link>
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "directory" | "saved-lists")}
        className="w-full max-w-full min-w-0 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/60 pb-2 gap-2">
          <TabsList className="grid grid-cols-2 sm:inline-flex w-full sm:w-auto bg-muted/40 p-1 h-auto">
            <TabsTrigger value="directory" className="gap-2 text-xs font-semibold py-2 px-3">
              <Database className="size-3.5 text-primary shrink-0" />
              <span className="truncate">Directory ({facets.totalLeads.toLocaleString()})</span>
            </TabsTrigger>
            <TabsTrigger value="saved-lists" className="gap-2 text-xs font-semibold py-2 px-3">
              <FileSpreadsheet className="size-3.5 text-violet-400 shrink-0" />
              <span className="truncate">Saved Lists ({existingLists.length})</span>
            </TabsTrigger>
          </TabsList>

          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-400 inline-block" />
              Sub-15ms Index
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-400 inline-block" />
              100% Unmasked Emails
            </span>
          </div>
        </div>

        {/* TAB 1: APOLLO.IO B2B DIRECTORY SEARCH */}
        <TabsContent value="directory" className="mt-0 space-y-4 outline-none w-full max-w-full min-w-0">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-start gap-4 w-full max-w-full min-w-0">
            {/* Left Filter Panel */}
            <LeadFiltersPanel
              facets={facets}
              filters={filters}
              onChange={setFilters}
              onApply={handleApplyFilters}
              isLoading={isLoading}
              totalResults={searchResult.total}
              tableHeight={tableHeight}
            />

            {/* Right Data Table */}
            <LeadsDataTable
              containerRef={tableRef}
              leads={searchResult.leads}
              total={searchResult.total}
              page={searchResult.page}
              pageSize={searchResult.pageSize}
              totalPages={searchResult.totalPages}
              isLoading={isLoading}
              isExporting={isExporting}
              selectedLeadIds={selectedLeadIds}
              isSelectAllMatching={isSelectAllMatching}
              onSelectLead={handleSelectLead}
              onSelectAll={handleSelectAll}
              onSelectCurrentPage={handleSelectCurrentPage}
              onSelectAllMatching={handleSelectAllMatching}
              onClearSelection={handleClearSelection}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              onViewLeadDetails={(lead) => setInspectingLead(lead)}
              onOpenAddToList={() => setIsAddToListOpen(true)}
              onExportCsv={handleExportCsv}
            />
          </div>
        </TabsContent>

        {/* TAB 2: MY SAVED CAMPAIGN LISTS */}
        <TabsContent value="saved-lists" className="mt-0 space-y-6 outline-none w-full max-w-full min-w-0">
          {/* Summary Strip */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">
                  Total Ready Contacts
                </span>
                <Users className="size-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {totalSavedLeads.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3 text-emerald-400" />
                Verified & enrolled in outreach sequences
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/40 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-medium uppercase tracking-wider">
                  Target Audience Lists
                </span>
                <FileSpreadsheet className="size-4 text-violet-400" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                {existingLists.length}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">Segmented campaign lists</p>
            </div>
          </div>

          {existingLists.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No campaign lists created yet"
              description="Switch to the B2B Lead Directory tab to select and segment leads from 183k+ verified contacts into campaign lists."
              action={
                <Button size="sm" onClick={() => setActiveTab("directory")} className="gap-1.5">
                  <Database className="h-4 w-4" /> Explore Directory
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {existingLists.map((list) => (
                <LeadListCard
                  key={list.id}
                  id={list.id}
                  name={list.name}
                  leadCount={Number(list.leadCount || 0)}
                  createdAt={list.createdAt}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Inspect Lead Sheet Drawer */}
      <LeadDetailsSheet
        lead={inspectingLead}
        open={!!inspectingLead}
        onOpenChange={(open) => {
          if (!open) setInspectingLead(null);
        }}
        onAddToList={(id) => {
          setSelectedLeadIds(new Set([id]));
          setIsAddToListOpen(true);
        }}
      />

      {/* Add To Campaign List Dialog */}
      <AddToCampaignDialog
        open={isAddToListOpen}
        onOpenChange={setIsAddToListOpen}
        selectedLeadIds={Array.from(selectedLeadIds)}
        isSelectAllMatching={isSelectAllMatching}
        totalMatchingCount={searchResult.total}
        searchParams={filters}
        existingLists={existingLists}
        onSuccess={() => {
          setSelectedLeadIds(new Set());
          setIsSelectAllMatching(false);
        }}
      />
    </div>
  );
}

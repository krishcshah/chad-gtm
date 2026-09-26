"use client";

import React from "react";
import {
  Badge,
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import {
  Briefcase,
  Building2,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Globe,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { DirectoryLead } from "@/lib/leads-directory";
import { toast } from "sonner";

interface LeadsDataTableProps {
  leads: DirectoryLead[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  isLoading: boolean;
  isExporting?: boolean;
  selectedLeadIds: Set<number>;
  isSelectAllMatching?: boolean;
  onSelectLead: (id: number) => void;
  onSelectAll: () => void;
  onSelectCurrentPage?: () => void;
  onSelectAllMatching?: () => void;
  onClearSelection?: () => void;
  onPageChange: (newPage: number) => void;
  onPageSizeChange: (newSize: number) => void;
  onViewLeadDetails: (lead: DirectoryLead) => void;
  onOpenAddToList: () => void;
  onExportCsv: () => void;
  containerRef?: React.Ref<HTMLDivElement>;
}

export function LeadsDataTable({
  leads,
  total,
  page,
  pageSize,
  totalPages,
  isLoading,
  isExporting = false,
  selectedLeadIds,
  isSelectAllMatching = false,
  onSelectLead,
  onSelectAll,
  onSelectCurrentPage,
  onSelectAllMatching,
  onClearSelection,
  onPageChange,
  onPageSizeChange,
  onViewLeadDetails,
  onOpenAddToList,
  onExportCsv,
  containerRef,
}: LeadsDataTableProps) {
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, key: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(`Copied ${label}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isAllSelected = leads.length > 0 && leads.every((l) => selectedLeadIds.has(l.id));
  const someSelected = leads.some((l) => selectedLeadIds.has(l.id)) && !isAllSelected;
  const isMasterChecked = isSelectAllMatching || isAllSelected;

  const handleMasterToggle = () => {
    if (isSelectAllMatching || isAllSelected) {
      if (onClearSelection) {
        onClearSelection();
      } else {
        onSelectAll();
      }
    } else {
      if (onSelectCurrentPage) {
        onSelectCurrentPage();
      } else {
        onSelectAll();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full max-w-full min-w-0 flex-1 flex flex-col bg-card/60 border border-border/70 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm"
    >
      {/* Table Header Bar */}
      <div className="p-3 sm:p-4 border-b border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-base text-foreground tracking-tight">
                {isLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground text-sm font-normal">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    Querying leads directory...
                  </span>
                ) : (
                  <span>
                    {total.toLocaleString()}{" "}
                    <span className="text-muted-foreground font-normal text-sm">Leads Found</span>
                  </span>
                )}
              </span>
              <Badge
                variant="outline"
                className="text-[11px] font-medium border-emerald-500/30 text-emerald-400 bg-emerald-500/10 whitespace-nowrap"
              >
                100% Unmasked & Direct
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Showing page {page} of {totalPages || 1} ({leads.length} leads displayed)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Select options dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs font-medium border-border/80"
              >
                <CheckSquare className="size-3.5 text-muted-foreground" />
                <span>
                  {isSelectAllMatching
                    ? `All ${total.toLocaleString()} Selected`
                    : selectedLeadIds.size > 0
                    ? `${selectedLeadIds.size} Selected`
                    : "Select"}
                </span>
                <ChevronDown className="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-1">
              <DropdownMenuItem
                onClick={() => (onSelectCurrentPage ? onSelectCurrentPage() : onSelectAll())}
                className="gap-2.5 px-3 py-2 cursor-pointer flex items-center"
              >
                <div className="size-4 shrink-0 flex items-center justify-center">
                  {!isSelectAllMatching && isAllSelected ? (
                    <Check className="size-3.5 text-primary" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-xs text-foreground">Select this page</div>
                  <div className="text-[11px] text-muted-foreground">
                    {leads.length} leads in current view
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => (onSelectAllMatching ? onSelectAllMatching() : onSelectAll())}
                className="gap-2.5 px-3 py-2 cursor-pointer flex items-center"
              >
                <div className="size-4 shrink-0 flex items-center justify-center">
                  {isSelectAllMatching ? (
                    <Check className="size-3.5 text-primary" />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs text-primary">Select all in list</div>
                  <div className="text-[11px] text-muted-foreground">
                    All {total.toLocaleString()} leads matching current filters
                  </div>
                </div>
              </DropdownMenuItem>
              {(selectedLeadIds.size > 0 || isSelectAllMatching) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => (onClearSelection ? onClearSelection() : onSelectAll())}
                    className="text-muted-foreground cursor-pointer px-3 py-1.5 text-xs"
                  >
                    Clear selection
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {(selectedLeadIds.size > 0 || isSelectAllMatching) && (
            <Button
              size="sm"
              variant="default"
              onClick={onOpenAddToList}
              className="gap-1.5 h-8 font-semibold bg-primary text-primary-foreground shadow-sm text-xs"
            >
              <UserPlus className="size-3.5" />
              {isSelectAllMatching
                ? `Add All ${total.toLocaleString()} to List`
                : `Add ${selectedLeadIds.size} Selected`}
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={onExportCsv}
            disabled={leads.length === 0 || isExporting}
            className="gap-1.5 h-8 text-xs font-medium"
          >
            {isExporting ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Exporting...
              </>
            ) : isSelectAllMatching ? (
              <>
                <Download className="size-3.5 text-primary" />
                Export All ({total.toLocaleString()})
              </>
            ) : (
              <>
                <Download className="size-3.5" />
                Export CSV
              </>
            )}
          </Button>

          {/* Page size selector */}
          <div className="flex items-center gap-1.5 ml-auto sm:ml-1 border-l border-border/60 pl-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val) => onPageSizeChange(Number(val))}
            >
              <SelectTrigger className="h-8 w-18 sm:w-20 text-xs">
                <SelectValue placeholder={String(pageSize)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Contextual Selection Banner */}
      {selectedLeadIds.size > 0 && !isSelectAllMatching && (
        <div className="px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs flex flex-wrap items-center justify-between gap-2 text-foreground">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">
              All <span className="font-bold">{leads.filter((l) => selectedLeadIds.has(l.id)).length}</span> leads on this page are selected.
            </span>
            {total > leads.length && onSelectAllMatching && (
              <button
                type="button"
                onClick={onSelectAllMatching}
                className="font-bold text-primary hover:underline transition-colors ml-1 cursor-pointer"
              >
                Select all {total.toLocaleString()} leads in this list
              </button>
            )}
          </div>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {isSelectAllMatching && (
        <div className="px-4 py-2 bg-primary/15 border-b border-primary/30 text-xs flex flex-wrap items-center justify-between gap-2 text-foreground">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="bg-primary/20 text-primary border-primary/30 font-semibold text-[10px]"
            >
              All {total.toLocaleString()} Selected
            </Badge>
            <span className="font-medium">
              All <span className="font-bold text-primary">{total.toLocaleString()}</span> leads in this list are selected across all pages.
            </span>
            {onSelectCurrentPage && (
              <button
                type="button"
                onClick={onSelectCurrentPage}
                className="text-muted-foreground hover:text-foreground hover:underline ml-1 cursor-pointer"
              >
                Only select this page ({leads.length})
              </button>
            )}
          </div>
          {onClearSelection && (
            <button
              type="button"
              onClick={onClearSelection}
              className="font-semibold text-primary hover:underline cursor-pointer"
            >
              Clear selection
            </button>
          )}
        </div>
      )}

      {/* Main Table Surface - ONLY this section is horizontally scrollable */}
      <div className="w-full max-w-full min-w-0 flex-1 min-h-[460px]">
        <Table className="min-w-[1050px]">
          <TableHeader className="bg-muted/40 sticky top-0 z-10 text-[11px] uppercase tracking-wider text-muted-foreground">
            <TableRow className="border-border/60 hover:bg-transparent">
              <TableHead className="w-12 px-3 text-center">
                <Checkbox
                  checked={isMasterChecked ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={handleMasterToggle}
                  aria-label="Select all on current page"
                />
              </TableHead>
              <TableHead className="min-w-[200px] font-semibold text-foreground">
                Contact & Title
              </TableHead>
              <TableHead className="min-w-[180px] font-semibold text-foreground">
                Company & Industry
              </TableHead>
              <TableHead className="min-w-[230px] font-semibold text-foreground">
                Primary Email
              </TableHead>
              <TableHead className="min-w-[150px] font-semibold text-foreground">
                Phone Number
              </TableHead>
              <TableHead className="min-w-[140px]">Location</TableHead>
              <TableHead className="min-w-[110px]">Employees</TableHead>
              <TableHead className="min-w-[100px]">Revenue</TableHead>
              <TableHead className="min-w-[80px] text-center">Profiles</TableHead>
              <TableHead className="w-20 text-right pr-4">Details</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="text-xs divide-y divide-border/40">
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 8) }).map((_, i) => (
                <TableRow key={i} className="animate-pulse">
                  <TableCell className="px-3">
                    <div className="size-4 bg-muted/60 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-32 bg-muted/60 rounded" />
                      <div className="h-3 w-24 bg-muted/40 rounded" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-28 bg-muted/60 rounded" />
                      <div className="h-3 w-16 bg-muted/40 rounded" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="h-3.5 w-36 bg-muted/60 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3.5 w-24 bg-muted/60 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3.5 w-20 bg-muted/60 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3.5 w-16 bg-muted/60 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3.5 w-14 bg-muted/60 rounded" />
                  </TableCell>
                  <TableCell>
                    <div className="h-3.5 w-8 bg-muted/60 rounded mx-auto" />
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="h-6 w-12 bg-muted/60 rounded ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center space-y-3 py-8">
                    <div className="size-12 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                      <Users className="size-6" />
                    </div>
                    <p className="font-semibold text-foreground text-sm">
                      No leads match your filter criteria
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Try clearing or loosening some filters in the left panel to expand your prospect search.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => {
                const isSelected = isSelectAllMatching || selectedLeadIds.has(lead.id);
                const leadName =
                  lead.fullName || `${lead.firstName} ${lead.lastName}`.trim() || "Lead Contact";
                const emailKey = `email_${lead.id}`;
                const phoneKey = `phone_${lead.id}`;

                return (
                  <TableRow
                    key={lead.id}
                    className={`hover:bg-muted/40 transition-colors group ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <TableCell className="px-3 text-center">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onSelectLead(lead.id)}
                        aria-label={`Select ${leadName}`}
                      />
                    </TableCell>

                    {/* Contact & Title */}
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                          {leadName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p
                            onClick={() => onViewLeadDetails(lead)}
                            className="font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                          >
                            {leadName}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            <span className="truncate">{lead.jobTitle || "—"}</span>
                          </p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Company & Industry */}
                    <TableCell>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 font-medium text-foreground truncate">
                          <span className="truncate">{lead.companyName || "—"}</span>
                          {lead.companyWebsite && (
                            <a
                              href={
                                lead.companyWebsite.startsWith("http")
                                  ? lead.companyWebsite
                                  : `https://${lead.companyWebsite}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary shrink-0"
                              title={lead.companyWebsite}
                            >
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                        {lead.industry && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1.5 mt-0.5 font-normal truncate max-w-[150px]"
                          >
                            {lead.industry}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Primary Email (ALWAYS FULLY VISIBLE) */}
                    <TableCell>
                      {lead.email ? (
                        <div className="flex items-center gap-1.5 group/email">
                          <span className="font-mono text-xs text-foreground select-all break-all">
                            {lead.email}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(lead.email, emailKey, "Email")}
                            className="opacity-0 group-hover/email:opacity-100 text-muted-foreground hover:text-foreground p-0.5 rounded transition-opacity"
                            title="Copy email"
                          >
                            {copiedKey === emailKey ? (
                              <Check className="size-3 text-emerald-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                          {lead.emailCount > 1 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-3.5 px-1 bg-muted/40 font-mono"
                              title={`${lead.emailCount} emails available in details`}
                            >
                              +{lead.emailCount - 1}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">—</span>
                      )}
                    </TableCell>

                    {/* Phone Number (ALWAYS FULLY VISIBLE) */}
                    <TableCell>
                      {lead.phone ? (
                        <div className="flex items-center gap-1.5 group/phone">
                          <span className="font-mono text-xs text-foreground select-all whitespace-nowrap">
                            {lead.phone}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(lead.phone, phoneKey, "Phone")}
                            className="opacity-0 group-hover/phone:opacity-100 text-muted-foreground hover:text-foreground p-0.5 rounded transition-opacity"
                            title="Copy phone"
                          >
                            {copiedKey === phoneKey ? (
                              <Check className="size-3 text-emerald-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                          {lead.phoneCount > 1 && (
                            <Badge
                              variant="outline"
                              className="text-[9px] h-3.5 px-1 bg-muted/40 font-mono"
                              title={`${lead.phoneCount} phones available in details`}
                            >
                              +{lead.phoneCount - 1}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs italic">—</span>
                      )}
                    </TableCell>

                    {/* Location */}
                    <TableCell>
                      <div className="flex items-center gap-1 text-muted-foreground truncate">
                        <MapPin className="size-3 shrink-0 text-muted-foreground/70" />
                        <span className="truncate">
                          {lead.city && lead.state
                            ? `${lead.city}, ${lead.state}`
                            : lead.location || lead.country || "—"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Employees */}
                    <TableCell>
                      {lead.teamSize ? (
                        <span className="text-xs text-muted-foreground font-medium">
                          {lead.teamSize}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Revenue */}
                    <TableCell>
                      {lead.revenueRange ? (
                        <span className="text-xs text-emerald-400/90 font-medium">
                          {lead.revenueRange}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Profiles */}
                    <TableCell className="text-center">
                      {lead.linkedinUrl ? (
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center size-6 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="LinkedIn Profile"
                        >
                          <Linkedin className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TableCell>

                    {/* Details Action */}
                    <TableCell className="text-right pr-4">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onViewLeadDetails(lead)}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                      >
                        <Eye className="size-3" />
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer Bar */}
      <div className="p-3 border-t border-border/70 bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full max-w-full min-w-0">
        <div className="text-xs text-muted-foreground text-center sm:text-left">
          Showing{" "}
          <span className="font-semibold text-foreground">
            {total > 0 ? (page - 1) * pageSize + 1 : 0}
          </span>{" "}
          to{" "}
          <span className="font-semibold text-foreground">
            {Math.min(page * pageSize, total)}
          </span>{" "}
          of <span className="font-semibold text-foreground">{total.toLocaleString()}</span> leads
        </div>

        {/* Page Nav Controls */}
        <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(1)}
            disabled={page <= 1 || isLoading}
            className="h-8 w-8 p-0"
            title="First page"
          >
            <ChevronsLeft className="size-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isLoading}
            className="h-8 px-2 sm:px-2.5 gap-1 text-xs"
          >
            <ChevronLeft className="size-3.5" />
            <span className="hidden xs:inline">Prev</span>
          </Button>

          <div className="flex items-center px-1.5 sm:px-2 text-xs font-medium text-foreground">
            <span>
              Page <span className="font-bold">{page}</span> / {totalPages || 1}
            </span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isLoading}
            className="h-8 px-2 sm:px-2.5 gap-1 text-xs"
          >
            <span className="hidden xs:inline">Next</span>
            <ChevronRight className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages || isLoading}
            className="h-8 w-8 p-0"
            title="Last page"
          >
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Input,
  Separator,
  Switch,
  cn,
} from "@smartreach/ui";
import {
  Briefcase,
  Building2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Filter,
  Globe2,
  Linkedin,
  Mail,
  Phone,
  RotateCcw,
  Search,
  Sparkles,
  Users2,
  SlidersHorizontal,
  User,
} from "lucide-react";
import type { DirectoryFacets, DirectorySearchParams } from "@/lib/leads-directory";

interface LeadFiltersPanelProps {
  facets: DirectoryFacets | null;
  filters: DirectorySearchParams;
  onChange: (updatedFilters: DirectorySearchParams) => void;
  onApply: () => void;
  isLoading?: boolean;
  totalResults?: number;
  tableHeight?: number | null;
  className?: string;
}

export function LeadFiltersPanel({
  facets,
  filters,
  onChange,
  onApply,
  isLoading = false,
  totalResults,
  tableHeight,
  className,
}: LeadFiltersPanelProps) {
  // Local collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    search: true,
    industry: true,
    country: true,
    seniority: true,
    teamSize: true,
    revenue: false,
    contactData: true,
  });

  // Industry search filter inside facet list
  const [industrySearch, setIndustrySearch] = useState("");
  const [showAllIndustries, setShowAllIndustries] = useState(false);

  // Country search filter inside facet list
  const [countrySearch, setCountrySearch] = useState("");
  const [showAllCountries, setShowAllCountries] = useState(false);

  const [isLg, setIsLg] = useState(false);

  React.useEffect(() => {
    const checkLg = () => setIsLg(window.innerWidth >= 1024);
    checkLg();
    window.addEventListener("resize", checkLg);
    return () => window.removeEventListener("resize", checkLg);
  }, []);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleTextQueryChange = (val: string) => {
    onChange({ ...filters, query: val, page: 1 });
  };

  const handleCompanyChange = (val: string) => {
    onChange({ ...filters, companyName: val, page: 1 });
  };

  const toggleIndustry = (val: string) => {
    const current = new Set(filters.industries || []);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    onChange({
      ...filters,
      industries: Array.from(current),
      page: 1,
    });
  };

  const toggleCountry = (val: string) => {
    const current = new Set(filters.countries || []);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    onChange({
      ...filters,
      countries: Array.from(current),
      page: 1,
    });
  };

  const toggleTeamSize = (val: string) => {
    const current = new Set(filters.teamSizes || []);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    onChange({
      ...filters,
      teamSizes: Array.from(current),
      page: 1,
    });
  };

  const toggleRevenue = (val: string) => {
    const current = new Set(filters.revenueRanges || []);
    if (current.has(val)) {
      current.delete(val);
    } else {
      current.add(val);
    }
    onChange({
      ...filters,
      revenueRanges: Array.from(current),
      page: 1,
    });
  };

  const toggleJobTitleKeyword = (title: string) => {
    const current = new Set(filters.jobTitles || []);
    if (current.has(title)) {
      current.delete(title);
    } else {
      current.add(title);
    }
    onChange({
      ...filters,
      jobTitles: Array.from(current),
      page: 1,
    });
  };

  const handleReset = () => {
    onChange({
      query: "",
      industries: [],
      countries: [],
      jobTitles: [],
      companyName: "",
      teamSizes: [],
      revenueRanges: [],
      hasEmail: false,
      hasWorkEmail: false,
      hasPersonalEmail: false,
      hasPhone: false,
      hasLinkedin: false,
      page: 1,
      pageSize: filters.pageSize || 20,
    });
    // Trigger apply immediately
    setTimeout(() => {
      onApply();
    }, 50);
  };

  // Filtered industries
  const filteredIndustries = (facets?.industries || []).filter((item) =>
    item.label.toLowerCase().includes(industrySearch.toLowerCase())
  );
  const displayedIndustries = showAllIndustries
    ? filteredIndustries
    : filteredIndustries.slice(0, 7);

  // Filtered countries
  const filteredCountries = (facets?.countries || []).filter((item) =>
    item.label.toLowerCase().includes(countrySearch.toLowerCase())
  );
  const displayedCountries = showAllCountries
    ? filteredCountries
    : filteredCountries.slice(0, 6);

  // Common seniority quick options
  const seniorityOptions = [
    { label: "Owner / Founder", value: "Owner" },
    { label: "CEO / Executive", value: "CEO" },
    { label: "President", value: "President" },
    { label: "VP / Vice President", value: "VP" },
    { label: "Director", value: "Director" },
    { label: "Manager", value: "Manager" },
    { label: "Partner", value: "Partner" },
  ];

  // Active filter count
  const activeCount =
    (filters.query ? 1 : 0) +
    (filters.companyName ? 1 : 0) +
    (filters.industries?.length || 0) +
    (filters.countries?.length || 0) +
    (filters.jobTitles?.length || 0) +
    (filters.teamSizes?.length || 0) +
    (filters.revenueRanges?.length || 0) +
    (filters.hasEmail ? 1 : 0) +
    (filters.hasWorkEmail ? 1 : 0) +
    (filters.hasPersonalEmail ? 1 : 0) +
    (filters.hasPhone ? 1 : 0) +
    (filters.hasLinkedin ? 1 : 0);

  return (
    <aside
      style={isLg && tableHeight ? { height: `${tableHeight}px` } : undefined}
      className={cn(
        "w-full lg:w-80 shrink-0 flex flex-col bg-card/60 border border-border/70 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm max-w-full min-w-0 transition-[height] duration-150",
        className
      )}
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-border/70 bg-muted/20 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">Lead Filters</span>
          {activeCount > 0 && (
            <Badge
              variant="default"
              className="text-[10px] h-5 px-1.5 font-bold bg-primary text-primary-foreground"
            >
              {activeCount}
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RotateCcw className="size-3" />
            Reset all
          </button>
        )}
      </div>

      {/* Scrollable Filters Body */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border/50 text-sm">
        {/* Quick Search Section */}
        <div className="p-3.5 space-y-2.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("search")}
          >
            <span className="flex items-center gap-1.5">
              <Search className="size-3.5 text-primary" />
              Keywords & Title
            </span>
            {openSections.search ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.search && (
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="e.g. CEO, founder, or keyword..."
                  value={filters.query || ""}
                  onChange={(e) => handleTextQueryChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onApply();
                  }}
                  className="pl-8 text-xs h-9 bg-background/50"
                />
              </div>

              <div className="relative">
                <Building2 className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Company name or domain..."
                  value={filters.companyName || ""}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onApply();
                  }}
                  className="pl-8 text-xs h-9 bg-background/50"
                />
              </div>
            </div>
          )}
        </div>

        {/* Industry Section */}
        <div className="p-3.5 space-y-2.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("industry")}
          >
            <span className="flex items-center gap-1.5">
              <Briefcase className="size-3.5 text-violet-400" />
              Industry
              {(filters.industries?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {filters.industries?.length}
                </Badge>
              )}
            </span>
            {openSections.industry ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.industry && (
            <div className="space-y-2 pt-1">
              {(facets?.industries?.length || 0) > 6 && (
                <Input
                  placeholder="Search industries..."
                  value={industrySearch}
                  onChange={(e) => setIndustrySearch(e.target.value)}
                  className="text-xs h-8 bg-background/50"
                />
              )}

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {displayedIndustries.map((item) => {
                  const isChecked = filters.industries?.includes(item.value);
                  return (
                    <label
                      key={item.value}
                      className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/40 cursor-pointer text-xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleIndustry(item.value)}
                        />
                        <span
                          className={`truncate ${
                            isChecked ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {item.count > 1000 ? `${(item.count / 1000).toFixed(1)}k` : item.count}
                      </span>
                    </label>
                  );
                })}

                {displayedIndustries.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2 text-center">
                    No matching industries
                  </p>
                )}
              </div>

              {filteredIndustries.length > 7 && (
                <button
                  type="button"
                  onClick={() => setShowAllIndustries(!showAllIndustries)}
                  className="text-xs text-primary hover:underline font-medium pt-1"
                >
                  {showAllIndustries
                    ? "Show less"
                    : `+ Show ${filteredIndustries.length - 7} more`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Country Section */}
        <div className="p-3.5 space-y-2.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("country")}
          >
            <span className="flex items-center gap-1.5">
              <Globe2 className="size-3.5 text-blue-400" />
              Country & Region
              {(filters.countries?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {filters.countries?.length}
                </Badge>
              )}
            </span>
            {openSections.country ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.country && (
            <div className="space-y-2 pt-1">
              {(facets?.countries?.length || 0) > 6 && (
                <Input
                  placeholder="Search countries..."
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  className="text-xs h-8 bg-background/50"
                />
              )}

              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {displayedCountries.map((item) => {
                  const isChecked = filters.countries?.includes(item.value);
                  return (
                    <label
                      key={item.value}
                      className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-muted/40 cursor-pointer text-xs group"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleCountry(item.value)}
                        />
                        <span
                          className={`truncate ${
                            isChecked ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          }`}
                        >
                          {item.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {item.count > 1000 ? `${(item.count / 1000).toFixed(1)}k` : item.count}
                      </span>
                    </label>
                  );
                })}
              </div>

              {filteredCountries.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllCountries(!showAllCountries)}
                  className="text-xs text-primary hover:underline font-medium pt-1"
                >
                  {showAllCountries
                    ? "Show less"
                    : `+ Show ${filteredCountries.length - 6} more`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Job Title & Seniority Section */}
        <div className="p-3.5 space-y-2.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("seniority")}
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-400" />
              Role & Seniority
              {(filters.jobTitles?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {filters.jobTitles?.length}
                </Badge>
              )}
            </span>
            {openSections.seniority ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.seniority && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {seniorityOptions.map((opt) => {
                const isSelected = filters.jobTitles?.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleJobTitleKeyword(opt.value)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary font-medium shadow-sm"
                        : "bg-muted/40 text-muted-foreground border-border/60 hover:border-primary/50 hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Company Size (# Employees) Section */}
        <div className="p-3.5 space-y-2.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("teamSize")}
          >
            <span className="flex items-center gap-1.5">
              <Users2 className="size-3.5 text-emerald-400" />
              Employee Count
              {(filters.teamSizes?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {filters.teamSizes?.length}
                </Badge>
              )}
            </span>
            {openSections.teamSize ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.teamSize && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {(facets?.teamSizes || []).map((item) => {
                const isChecked = filters.teamSizes?.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggleTeamSize(item.value)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs text-left transition-all ${
                      isChecked
                        ? "bg-primary/10 border-primary text-primary font-semibold"
                        : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="text-[10px] opacity-70 ml-1">
                      {item.count > 1000 ? `${(item.count / 1000).toFixed(0)}k` : item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Revenue Range Section */}
        <div className="p-3.5 space-y-2.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("revenue")}
          >
            <span className="flex items-center gap-1.5">
              <DollarSign className="size-3.5 text-emerald-500" />
              Annual Revenue
              {(filters.revenueRanges?.length || 0) > 0 && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1">
                  {filters.revenueRanges?.length}
                </Badge>
              )}
            </span>
            {openSections.revenue ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.revenue && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {(facets?.revenueRanges || []).map((item) => {
                const isChecked = filters.revenueRanges?.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggleRevenue(item.value)}
                    className={`flex items-center justify-between px-2 py-1.5 rounded-lg border text-xs text-left transition-all ${
                      isChecked
                        ? "bg-primary/10 border-primary text-primary font-semibold"
                        : "bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className="text-[10px] opacity-70 ml-1">
                      {item.count > 1000 ? `${(item.count / 1000).toFixed(0)}k` : item.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Contact Data Availability Section */}
        <div className="p-3.5 space-y-3">
          <div
            className="flex items-center justify-between cursor-pointer select-none font-medium text-xs uppercase tracking-wider text-muted-foreground"
            onClick={() => toggleSection("contactData")}
          >
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5 text-sky-400" />
              Contact Availability
            </span>
            {openSections.contactData ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
          </div>

          {openSections.contactData && (
            <div className="space-y-2 pt-1">
              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-xs text-foreground flex items-center gap-1.5 font-medium">
                  <Briefcase className="size-3.5 text-primary" />
                  Has Work Email
                </span>
                <Switch
                  checked={!!filters.hasWorkEmail}
                  onCheckedChange={(c) => onChange({ ...filters, hasWorkEmail: c, page: 1 })}
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-xs text-foreground flex items-center gap-1.5">
                  <User className="size-3.5 text-sky-400" />
                  Has Personal Email
                </span>
                <Switch
                  checked={!!filters.hasPersonalEmail}
                  onCheckedChange={(c) => onChange({ ...filters, hasPersonalEmail: c, page: 1 })}
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Mail className="size-3.5 text-muted-foreground" />
                  Has Any Email
                </span>
                <Switch
                  checked={!!filters.hasEmail}
                  onCheckedChange={(c) => onChange({ ...filters, hasEmail: c, page: 1 })}
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-xs text-foreground flex items-center gap-1.5">
                  <Phone className="size-3.5 text-muted-foreground" />
                  Has Direct Phone
                </span>
                <Switch
                  checked={!!filters.hasPhone}
                  onCheckedChange={(c) => onChange({ ...filters, hasPhone: c, page: 1 })}
                />
              </label>

              <label className="flex items-center justify-between py-1 cursor-pointer">
                <span className="text-xs text-foreground flex items-center gap-1.5">
                  <Linkedin className="size-3.5 text-muted-foreground" />
                  Has LinkedIn URL
                </span>
                <Switch
                  checked={!!filters.hasLinkedin}
                  onCheckedChange={(c) => onChange({ ...filters, hasLinkedin: c, page: 1 })}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Sticky Bottom Apply Button */}
      <div className="p-3 border-t border-border/70 bg-card/80 backdrop-blur-sm shrink-0">
        <Button
          type="button"
          onClick={onApply}
          disabled={isLoading}
          className="w-full font-semibold shadow-md gap-2 h-10 bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer"
        >
          <Filter className="size-4" />
          {isLoading ? "Filtering leads..." : "Filter Leads"}
          {totalResults !== undefined && (
            <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full font-normal">
              {totalResults.toLocaleString()}
            </span>
          )}
        </Button>
      </div>
    </aside>
  );
}

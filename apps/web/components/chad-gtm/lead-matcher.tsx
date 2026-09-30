"use client";

import { useState, useEffect, useTransition } from "react";
import { Users, Search, Check, Plus, X, ArrowRight, Loader2, Database, Mail, MapPin, Building2 } from "lucide-react";
import { Button } from "@smartreach/ui";
import { searchMatchingLeadsAction } from "@/lib/chad-gtm-actions";
import type { DirectoryLead } from "@/lib/leads-directory";

export function LeadMatcher({
  initialIndustries,
  allAvailableIndustries,
  onProceed,
}: {
  initialIndustries: string[];
  allAvailableIndustries: string[];
  onProceed: (selectedIndustries: string[]) => void;
}) {
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(
    initialIndustries.length > 0 ? initialIndustries : allAvailableIndustries.slice(0, 3)
  );
  const [industrySearch, setIndustrySearch] = useState("");
  const [totalLeads, setTotalLeads] = useState<number>(0);
  const [sampleLeads, setSampleLeads] = useState<DirectoryLead[]>([]);
  const [isPending, startTransition] = useTransition();

  const queryLeads = (industries: string[]) => {
    startTransition(async () => {
      const res = await searchMatchingLeadsAction(industries, 1, 10);
      if (res.ok) {
        setTotalLeads(res.total);
        setSampleLeads(res.leads);
      }
    });
  };

  useEffect(() => {
    queryLeads(selectedIndustries);
  }, [selectedIndustries]);

  const toggleIndustry = (ind: string) => {
    if (selectedIndustries.includes(ind)) {
      if (selectedIndustries.length > 1) {
        setSelectedIndustries(selectedIndustries.filter((i) => i !== ind));
      }
    } else {
      setSelectedIndustries([...selectedIndustries, ind]);
    }
  };

  const filteredIndustries = allAvailableIndustries
    .filter((ind) => !selectedIndustries.includes(ind))
    .filter((ind) => ind.toLowerCase().includes(industrySearch.toLowerCase()))
    .slice(0, 15);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              <Database className="size-3" /> Step 3 of 5
            </span>
            <span className="text-xs text-muted-foreground">Apollo B2B Lead Extraction</span>
          </div>
          <h2 className="text-xl font-bold tracking-tight text-foreground mt-1">
            Target Industry Matcher
          </h2>
          <p className="text-xs text-muted-foreground">
            Cross-referencing your ICP against the built-in Apollo-style 329k+ B2B directory.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-center flex items-center justify-between sm:block">
            <div className="text-xs font-medium text-muted-foreground">Verified Prospects</div>
            <div className="text-base sm:text-lg font-bold text-emerald-400 flex items-center justify-center gap-1.5 font-mono">
              {isPending ? (
                <Loader2 className="size-4 animate-spin text-emerald-400" />
              ) : (
                `🎯 ${totalLeads.toLocaleString()}`
              )}
            </div>
          </div>

          <Button
            type="button"
            onClick={() => onProceed(selectedIndustries)}
            className="bg-primary text-primary-foreground font-semibold text-xs shadow-md h-10 w-full sm:w-auto"
          >
            Calibrate Email Tone <ArrowRight className="size-3.5 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* Interactive Selected Pills */}
      <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm space-y-4">
        <div>
          <span className="text-xs font-bold text-foreground block mb-2">
            Active Target Industries ({selectedIndustries.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {selectedIndustries.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className="group flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-400 transition-all"
              >
                <span>{ind}</span>
                <X className="size-3 transition-transform group-hover:scale-125" />
              </button>
            ))}
          </div>
        </div>

        {/* Search & Add More Industries */}
        <div className="pt-2 border-t border-border/40">
          <div className="flex items-center gap-2 mb-2">
            <Search className="size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search & add more target industries..."
              value={industrySearch}
              onChange={(e) => setIndustrySearch(e.target.value)}
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {filteredIndustries.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2.5 py-0.5 text-[11px] text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-all"
              >
                <Plus className="size-2.5" /> {ind}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 10 Prospect Preview Table */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-primary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Live Prospect Preview (Top 10 of {totalLeads.toLocaleString()})
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground">100% Direct Corporate Emails</span>
        </div>

        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-left text-xs min-w-[550px]">
            <thead className="border-b border-border/40 bg-muted/40 text-[10px] uppercase font-bold text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Prospect</th>
                <th className="px-4 py-2.5">Job Title</th>
                <th className="px-4 py-2.5">Company</th>
                <th className="px-4 py-2.5">Industry</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {sampleLeads.length > 0 ? (
                sampleLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {lead.fullName || `${lead.firstName} ${lead.lastName}`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.jobTitle}</td>
                    <td className="px-4 py-3 font-semibold text-foreground/90">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="size-3 text-muted-foreground" />
                        {lead.companyName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.industry}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1 text-[11px]">
                        <MapPin className="size-2.5 text-muted-foreground" />
                        {lead.location || lead.country || "Global"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        <Mail className="size-2.5" /> Verified
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    {isPending ? "Filtering matching leads..." : "No leads found for this filter combination."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

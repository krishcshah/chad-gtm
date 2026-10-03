"use client";

import { useState, useEffect, useTransition } from "react";
import { Users, Search, Plus, X, ArrowRight, Loader2, Database, Mail, MapPin, Building2 } from "lucide-react";
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
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white">
              STAGE 03 // 100M+ DIRECTORY MATCH
            </span>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">Lead Extraction</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold uppercase tracking-wider text-white mt-1">
            Target Industry & Lead Matcher
          </h2>
          <p className="text-xs text-zinc-400 font-sans mt-0.5">
            Cross-referencing your ICP against the built-in 100M+ global B2B directory.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="rounded-none border border-zinc-800 bg-zinc-950 px-3.5 py-1.5 text-center flex items-center justify-between sm:block">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500">Verified Leads Matched</div>
            <div className="text-sm sm:text-base font-bold text-white flex items-center justify-center gap-1.5">
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin text-white" />
              ) : (
                `${totalLeads.toLocaleString()} PROSPECTS`
              )}
            </div>
          </div>

          <Button
            type="button"
            onClick={() => onProceed(selectedIndustries)}
            className="rounded-none bg-white text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white h-10 px-5 w-full sm:w-auto"
          >
            Calibrate Voice & Copy <ArrowRight className="size-3.5 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* Interactive Selected Pills */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 space-y-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-2">
            Active Target Industries ({selectedIndustries.length})
          </span>
          <div className="flex flex-wrap gap-1.5">
            {selectedIndustries.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className="group flex items-center gap-1.5 rounded-none border border-zinc-700 bg-black px-2.5 py-1 text-xs text-zinc-200 hover:border-white hover:text-white transition-colors"
              >
                <span>{ind}</span>
                <X className="size-3 text-zinc-500 group-hover:text-white" />
              </button>
            ))}
          </div>
        </div>

        {/* Search & Add More Industries */}
        <div className="pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <Search className="size-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search additional B2B industries..."
              value={industrySearch}
              onChange={(e) => setIndustrySearch(e.target.value)}
              className="w-full bg-transparent text-xs text-white placeholder:text-zinc-600 focus:outline-none font-mono"
            />
          </div>

          <div className="flex flex-wrap gap-1 pt-1">
            {filteredIndustries.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className="flex items-center gap-1 rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 hover:border-zinc-700 hover:text-zinc-200 transition-colors"
              >
                <Plus className="size-2.5" /> {ind}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 10 Prospect Preview Table */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950 overflow-hidden font-mono">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-black">
          <div className="flex items-center gap-2">
            <Users className="size-3.5 text-white" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Prospect Preview (Top 10 of {totalLeads.toLocaleString()})
            </h3>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Verified Work Emails</span>
        </div>

        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="w-full text-left text-xs min-w-[550px]">
            <thead className="border-b border-zinc-800 bg-zinc-950 text-[10px] uppercase font-bold text-zinc-400">
              <tr>
                <th className="px-4 py-2">Prospect</th>
                <th className="px-4 py-2">Job Title</th>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Industry</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sampleLeads.length > 0 ? (
                sampleLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">
                      {lead.fullName || `${lead.firstName} ${lead.lastName}`}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 font-sans text-xs">{lead.jobTitle}</td>
                    <td className="px-4 py-2.5 font-medium text-zinc-300">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="size-3 text-zinc-500" />
                        {lead.companyName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{lead.industry}</td>
                    <td className="px-4 py-2.5 text-zinc-400">
                      <span className="flex items-center gap-1 text-[11px]">
                        <MapPin className="size-2.5 text-zinc-500" />
                        {lead.location || lead.country || "Global"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-zinc-300">
                        <Mail className="size-2.5 text-white" /> Verified
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-xs text-zinc-500 font-mono">
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

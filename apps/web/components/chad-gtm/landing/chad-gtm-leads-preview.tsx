"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Search,
} from "lucide-react";
import { Badge, Button } from "@smartreach/ui";

const SAMPLE_PROSPECTS = [
  {
    name: "Elena Rostova",
    title: "VP of Product Growth",
    company: "DataMesh Systems",
    industry: "Computer Software",
    location: "San Francisco, CA",
    emailType: "Verified Work Email",
  },
  {
    name: "Marcus Vance",
    title: "Chief Technology Officer",
    company: "PayNexus Payments",
    industry: "Financial Services",
    location: "New York, NY",
    emailType: "Verified Work Email",
  },
  {
    name: "Dr. Sarah Chen",
    title: "Head of AI Infrastructure",
    company: "BioSyn Labs",
    industry: "Biotechnology",
    location: "Boston, MA",
    emailType: "Verified Work Email",
  },
  {
    name: "Liam O'Connor",
    title: "Director of Revenue Operations",
    company: "HyperScale Cloud",
    industry: "Information Technology",
    location: "Austin, TX",
    emailType: "Verified Work Email",
  },
  {
    name: "Amara Diallo",
    title: "Founding Engineer",
    company: "NeuraGrid AI",
    industry: "Computer Software",
    location: "Seattle, WA",
    emailType: "Verified Work Email",
  },
  {
    name: "Julian Becker",
    title: "Chief Marketing Officer",
    company: "OmniReach Digital",
    industry: "Marketing & Advertising",
    location: "Berlin, Germany",
    emailType: "Verified Work Email",
  },
];

export function ChadGtmLeadsPreview() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", "Computer Software", "Financial Services", "Information Technology", "Biotechnology"];

  const filtered = SAMPLE_PROSPECTS.filter((p) => {
    const matchCat = activeCategory === "All" || p.industry === activeCategory;
    const matchSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.company.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <section id="leads" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 mb-4">
            <Database className="size-3 text-zinc-400" />
            LOCAL DATABASE // ZERO SCRAPING FEES
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            329,563 Verified B2B Leads
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-mono">
            Embedded Apollo-style SQLite directory. Directly queryable with zero per-lead export charges.
          </p>
        </div>

        {/* Directory Card Screen */}
        <div className="mx-auto max-w-5xl rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
          {/* Stats Header Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-5 border-b border-zinc-800 text-center font-mono">
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">329,563</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Total Verified Leads</div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">236,104</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Direct Work Emails</div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">114,482</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Secondary Contacts</div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">$0.00</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Export Credits Fee</div>
            </div>
          </div>

          {/* Search & Category Pills */}
          <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by title, person, or domain..."
                className="w-full rounded-none border border-zinc-800 bg-black py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-600 outline-none focus:border-white"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-none px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors border ${
                    activeCategory === cat
                      ? "border-white bg-white text-black font-semibold"
                      : "border-zinc-800 bg-black text-zinc-400 hover:text-white hover:border-zinc-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Prospects Table */}
          <div className="mt-5 overflow-x-auto rounded-none border border-zinc-800 bg-black [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-left border-collapse text-xs min-w-[560px] font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950 text-[10px] uppercase tracking-wider">
                  <th className="p-3 font-semibold">Decision Maker</th>
                  <th className="p-3 font-semibold">Company</th>
                  <th className="p-3 font-semibold">Industry</th>
                  <th className="p-3 font-semibold">Location</th>
                  <th className="p-3 font-semibold text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((p, i) => (
                  <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-[10px] text-zinc-400 font-sans">{p.title}</div>
                    </td>
                    <td className="p-3 text-zinc-300 font-medium">{p.company}</td>
                    <td className="p-3 text-zinc-400">{p.industry}</td>
                    <td className="p-3 text-zinc-400">{p.location}</td>
                    <td className="p-3 text-right">
                      <span className="rounded-none border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[9px] uppercase tracking-widest text-zinc-300">
                        Verified
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left font-mono">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
              Sample records previewed · Complete database unlocked on signup
            </span>
            <Button asChild size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white w-full sm:w-auto">
              <Link href="/signup">
                Access 329k Leads <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

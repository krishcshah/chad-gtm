"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Filter,
  Globe,
  Mail,
  Search,
  Sparkles,
  Users,
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
    <section id="leads" className="relative py-24 sm:py-32 border-t border-white/10 bg-black overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-300 backdrop-blur-md mb-4">
            <Database className="size-3.5 text-emerald-400" />
            Built-In Apollo B2B Directory
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
            329,563 Verified Leads Included.
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Zero Scraping Subscriptions Needed.
            </span>
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Stop paying Apollo or ZoomInfo $99/mo for restrictive lead exports.
            Our embedded B2B database matches your ICP automatically with sub-second facet filtering.
          </p>
        </div>

        {/* Directory Card Screen */}
        <div className="mx-auto max-w-5xl rounded-3xl border border-white/10 bg-zinc-950/80 p-4 sm:p-8 shadow-2xl backdrop-blur-2xl">
          {/* Stats Header Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 pb-6 border-b border-white/10 text-center">
            <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="text-xl sm:text-2xl font-extrabold text-white font-mono">329,563</div>
              <div className="text-[10px] sm:text-[11px] text-zinc-400 font-medium mt-0.5">Total B2B Leads</div>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-400 font-mono">236,104</div>
              <div className="text-[10px] sm:text-[11px] text-zinc-400 font-medium mt-0.5">Verified Work Emails</div>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="text-xl sm:text-2xl font-extrabold text-cyan-400 font-mono">114,482</div>
              <div className="text-[10px] sm:text-[11px] text-zinc-400 font-medium mt-0.5">Personal Emails</div>
            </div>
            <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="text-xl sm:text-2xl font-extrabold text-violet-400 font-mono">100% Free</div>
              <div className="text-[10px] sm:text-[11px] text-zinc-400 font-medium mt-0.5">No Export Credits</div>
            </div>
          </div>

          {/* Search & Category Pills */}
          <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, name, or company..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-10 pr-4 text-xs text-white placeholder-zinc-500 outline-none focus:border-emerald-500/50"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    activeCategory === cat
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-white/[0.02] text-zinc-400 border border-white/5 hover:text-white"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Prospects Table */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-white/5 bg-black/40 [-webkit-overflow-scrolling:touch]">
            <table className="w-full text-left border-collapse text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 bg-white/[0.02]">
                  <th className="p-3.5 font-medium">Name & Role</th>
                  <th className="p-3.5 font-medium">Company</th>
                  <th className="p-3.5 font-medium">Industry</th>
                  <th className="p-3.5 font-medium">Location</th>
                  <th className="p-3.5 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((p, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-3.5">
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-[11px] text-zinc-400">{p.title}</div>
                    </td>
                    <td className="p-3.5 text-zinc-300 font-medium">{p.company}</td>
                    <td className="p-3.5 text-zinc-400">{p.industry}</td>
                    <td className="p-3.5 text-zinc-400">{p.location}</td>
                    <td className="p-3.5 text-right">
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px] py-0.5">
                        <CheckCircle2 className="size-2.5 mr-1" />
                        {p.emailType}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <span className="text-xs text-zinc-400">
              Showing sample verified prospects · 329k+ available upon instant signup
            </span>
            <Button asChild size="sm" className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs gap-1.5 shadow-md shadow-emerald-500/20 w-full sm:w-auto">
              <Link href="/signup">
                Access All 329k Leads Free <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

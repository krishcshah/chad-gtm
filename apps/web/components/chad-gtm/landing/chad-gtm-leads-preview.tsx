"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@smartreach/ui";

const SAMPLE_PROSPECTS = [
  // Preserved: 7 distinct leads on All Leads tab to match category height exactly
  {
    name: "Elena Rostova",
    title: "VP of Product Growth",
    company: "DataMesh Systems",
    industry: "Computer Software",
    email: "elena.rostova@datameshsystems.com",
    location: "San Francisco, CA",
    emailType: "Verified Work Email",
  },
  {
    name: "Marcus Vance",
    title: "Chief Technology Officer",
    company: "PayNexus Payments",
    industry: "Financial Services",
    email: "marcus.vance@paynexus.com",
    location: "New York, NY",
    emailType: "Verified Work Email",
  },
  {
    name: "Dr. Sarah Chen",
    title: "Head of AI Infrastructure",
    company: "BioSyn Labs",
    industry: "Biotechnology",
    email: "sarah.chen@biosynlabs.org",
    location: "Boston, MA",
    emailType: "Verified Work Email",
  },
  {
    name: "Liam O'Connor",
    title: "Director of Revenue Operations",
    company: "HyperScale Cloud",
    industry: "Information Technology",
    email: "liam.oconnor@hyperscalecloud.com",
    location: "Austin, TX",
    emailType: "Verified Work Email",
  },
  {
    name: "Amara Diallo",
    title: "Founding Engineer",
    company: "NeuraGrid AI",
    industry: "Computer Software",
    email: "amara.diallo@neuragrid.ai",
    location: "Seattle, WA",
    emailType: "Verified Work Email",
  },
  {
    name: "Carlos Mendez",
    title: "VP of Enterprise Security",
    company: "FortressGuard",
    industry: "Cybersecurity",
    email: "carlos.mendez@fortressguard.io",
    location: "Chicago, IL",
    emailType: "Verified Work Email",
  },
  {
    name: "Amina Al-Mansoor",
    title: "Chief Operating Officer",
    company: "Aura Logistics",
    industry: "Supply Chain & Logistics",
    email: "amina.mansoor@auralogistics.com",
    location: "London, UK",
    emailType: "Verified Work Email",
  },
];

const INDUSTRIES = [
  "All Leads",
  "Computer Software",
  "Financial Services",
  "Biotechnology",
  "Information Technology",
  "Cybersecurity",
];

export function ChadGtmLeadsPreview() {
  const [activeCategory, setActiveCategory] = useState("All Leads");

  const filteredLeads =
    activeCategory === "All Leads"
      ? SAMPLE_PROSPECTS
      : SAMPLE_PROSPECTS.filter((p) => p.industry === activeCategory);

  return (
    <section id="leads" className="relative py-24 sm:py-32 border-t border-zinc-800/80 bg-[#050505] overflow-hidden font-sans">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-none border border-emerald-500/30 bg-emerald-950/20 px-3 py-1 font-mono text-xs text-emerald-400 mb-4">
            <Database className="size-3 text-emerald-400" />
            <span>Built-In B2B Directory · Zero Export Taxes</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white">
            10.2M verified decision-makers. Included at $0.
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Stop buying $99/mo export credits on Apollo or ZoomInfo. Search, filter, and launch campaigns directly against our high-speed verified SQLite database with zero per-contact fees.
          </p>
        </div>

        {/* Directory Card Screen */}
        <div className="mx-auto max-w-5xl rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-6 shadow-2xl">
          {/* Stats Header Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-5 border-b border-zinc-800 text-center font-mono">
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">10.2M</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                Verified B2B Leads
              </div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-emerald-400">7.4 GB</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                Indexed SQLite Engine
              </div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">190+</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                Countries Covered
              </div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">$0</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">
                Export / Lead Fees
              </div>
            </div>
          </div>

          {/* Industry Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 py-4 border-b border-zinc-800">
            {INDUSTRIES.map((ind) => (
              <button
                key={ind}
                type="button"
                onClick={() => setActiveCategory(ind)}
                className={`rounded-none px-3 py-1.5 text-xs transition-colors ${
                  activeCategory === ind
                    ? "border border-white bg-white text-black font-semibold"
                    : "border border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white hover:border-zinc-700"
                }`}
              >
                {ind}
              </button>
            ))}
          </div>

          {/* Data Table */}
          <div className="overflow-x-auto pt-3">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-zinc-800/80 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5 px-3">Decision Maker</th>
                  <th className="py-2.5 px-3">Title &amp; Company</th>
                  <th className="py-2.5 px-3">Industry</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3 text-right">Verification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {filteredLeads.map((p, idx) => (
                  <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-[11px] text-zinc-500 font-mono select-all">
                        {p.email.split("@")[0]}@•••.{p.email.split(".").pop()}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="text-zinc-200">{p.title}</div>
                      <div className="text-[11px] text-zinc-500">{p.company}</div>
                    </td>
                    <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">{p.industry}</td>
                    <td className="py-3 px-3 text-zinc-400 text-[11px]">{p.location}</td>
                    <td className="py-3 px-3 text-right">
                      <span className="inline-flex items-center gap-1 border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 px-2 py-0.5 text-[10px] font-mono rounded-none">
                        <CheckCircle2 className="size-3" /> Verified
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Banner */}
          <div className="mt-5 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-emerald-400" />
              <span>Full directory unlocked automatically when you enter your company URL</span>
            </div>
            <Button
              asChild
              size="sm"
              className="rounded-none bg-white text-black font-semibold text-xs hover:bg-zinc-200 border border-white"
            >
              <Link href="/signup">
                Access All 10.2M Leads Free <ArrowRight className="size-3.5 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

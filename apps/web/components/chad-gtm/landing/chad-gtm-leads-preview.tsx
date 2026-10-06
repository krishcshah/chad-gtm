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
  // Computer Software (7 leads)
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
    name: "Amara Diallo",
    title: "Founding Engineer",
    company: "NeuraGrid AI",
    industry: "Computer Software",
    email: "amara.diallo@neuragrid.ai",
    location: "Seattle, WA",
    emailType: "Verified Work Email",
  },
  {
    name: "David Kelling",
    title: "Head of Solutions Architecture",
    company: "CloudStack IO",
    industry: "Computer Software",
    email: "david.kelling@cloudstack.io",
    location: "Austin, TX",
    emailType: "Verified Work Email",
  },
  {
    name: "Priya Patel",
    title: "VP of Engineering",
    company: "AppForge Labs",
    industry: "Computer Software",
    email: "priya.patel@appforge.dev",
    location: "New York, NY",
    emailType: "Verified Work Email",
  },
  {
    name: "Henrik Lindqvist",
    title: "Director of Product Ops",
    company: "DevVelocity",
    industry: "Computer Software",
    email: "henrik.l@devvelocity.com",
    location: "Stockholm, Sweden",
    emailType: "Verified Work Email",
  },
  {
    name: "Rachel Torres",
    title: "Chief Technology Officer",
    company: "VectorScale AI",
    industry: "Computer Software",
    email: "rachel.torres@vectorscale.ai",
    location: "Denver, CO",
    emailType: "Verified Work Email",
  },
  {
    name: "Alex Mercer",
    title: "VP of Enterprise Systems",
    company: "HyperFlow Suite",
    industry: "Computer Software",
    email: "alex.mercer@hyperflow.io",
    location: "Chicago, IL",
    emailType: "Verified Work Email",
  },

  // Financial Services (7 leads)
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
    name: "Charlotte Dupond",
    title: "VP of Risk Management",
    company: "Meridian Capital",
    industry: "Financial Services",
    email: "c.dupond@meridiancap.eu",
    location: "London, UK",
    emailType: "Verified Work Email",
  },
  {
    name: "Tariq Mansoor",
    title: "Head of Treasury Tech",
    company: "ApexFin Global",
    industry: "Financial Services",
    email: "tariq.mansoor@apexfin.com",
    location: "Dubai, UAE",
    emailType: "Verified Work Email",
  },
  {
    name: "Sarah Jenkins",
    title: "Director of Compliance Ops",
    company: "FinLuminate",
    industry: "Financial Services",
    email: "sarah.j@finluminate.com",
    location: "Boston, MA",
    emailType: "Verified Work Email",
  },
  {
    name: "Kenneth Zhao",
    title: "VP of Strategic Growth",
    company: "Altus Wealth Partners",
    industry: "Financial Services",
    email: "ken.zhao@altuswealth.com",
    location: "San Francisco, CA",
    emailType: "Verified Work Email",
  },
  {
    name: "Evelyn Walsh",
    title: "Chief Operating Officer",
    company: "Crestline Asset Mgmt",
    industry: "Financial Services",
    email: "e.walsh@crestlineam.com",
    location: "Chicago, IL",
    emailType: "Verified Work Email",
  },
  {
    name: "Robert Fischer",
    title: "Head of Institutional Sales",
    company: "Zurich Ledger AG",
    industry: "Financial Services",
    email: "rfischer@zurichledger.ch",
    location: "Zurich, Switzerland",
    emailType: "Verified Work Email",
  },

  // Information Technology (7 leads)
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
    name: "Mateo Silva",
    title: "VP of Cloud Infrastructure",
    company: "Datasync Global",
    industry: "Information Technology",
    email: "mateo.silva@datasync.io",
    location: "Toronto, Canada",
    emailType: "Verified Work Email",
  },
  {
    name: "Jennifer Wu",
    title: "Chief Info Security Officer",
    company: "IronWall Security",
    industry: "Information Technology",
    email: "jennifer.wu@ironwallsec.com",
    location: "Washington, DC",
    emailType: "Verified Work Email",
  },
  {
    name: "Nathan Brooks",
    title: "Director of Enterprise Arch",
    company: "Nexus Networks",
    industry: "Information Technology",
    email: "nathan.brooks@nexusnetworks.com",
    location: "Dallas, TX",
    emailType: "Verified Work Email",
  },
  {
    name: "Ananya Sharma",
    title: "Head of IT Operations",
    company: "OmniCloud Systems",
    industry: "Information Technology",
    email: "ananya.s@omnicloud.in",
    location: "Bengaluru, India",
    emailType: "Verified Work Email",
  },
  {
    name: "Carlos Mendez",
    title: "VP of Systems Engineering",
    company: "CoreInfrastructure",
    industry: "Information Technology",
    email: "cmendez@coreinfra.com",
    location: "Miami, FL",
    emailType: "Verified Work Email",
  },
  {
    name: "Samuel Thorne",
    title: "Director of Datacenter Ops",
    company: "TierZero Systems",
    industry: "Information Technology",
    email: "sthorne@tierzeroops.com",
    location: "Salt Lake City, UT",
    emailType: "Verified Work Email",
  },

  // Biotechnology (7 leads)
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
    name: "Dr. Benjamin Hayes",
    title: "VP of Computational Biology",
    company: "GenoMetrics",
    industry: "Biotechnology",
    email: "b.hayes@genometrics.bio",
    location: "Cambridge, MA",
    emailType: "Verified Work Email",
  },
  {
    name: "Miriam Al-Sabah",
    title: "Director of Clinical Informatics",
    company: "ThermaGen Therapeutics",
    industry: "Biotechnology",
    email: "m.alsabah@thermagen.com",
    location: "San Diego, CA",
    emailType: "Verified Work Email",
  },
  {
    name: "Dr. Klaus Werner",
    title: "Chief Scientific Officer",
    company: "NeuroVector Biotech",
    industry: "Biotechnology",
    email: "k.werner@neurovector.de",
    location: "Munich, Germany",
    emailType: "Verified Work Email",
  },
  {
    name: "Olivia Sterling",
    title: "VP of Regulatory Operations",
    company: "CytoPulse Pharma",
    industry: "Biotechnology",
    email: "o.sterling@cytopulse.com",
    location: "Raleigh, NC",
    emailType: "Verified Work Email",
  },
  {
    name: "Dr. Jonathan Rey",
    title: "Head of Translational Med",
    company: "HelixNova Biosciences",
    industry: "Biotechnology",
    email: "j.rey@helixnova.com",
    location: "Basel, Switzerland",
    emailType: "Verified Work Email",
  },
  {
    name: "Maya Lin",
    title: "Director of Lab Automation",
    company: "Veloce Biosystems",
    industry: "Biotechnology",
    email: "maya.lin@velocebio.com",
    location: "San Francisco, CA",
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
      p.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <section id="leads" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black overflow-hidden">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-300 mb-4">
            <Database className="size-3 text-zinc-400" />
            GLOBAL DIRECTORY // ZERO SCRAPING TAX
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            100M+ Verified Global Leads
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-zinc-400 font-mono">
            High-velocity enterprise directory. Actively ingesting and indexing our complete 100,000,000+ contact database across 190+ countries—with zero credit paywalls or export fees.
          </p>
        </div>

        {/* Directory Card Screen */}
        <div className="mx-auto max-w-5xl rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
          {/* Stats Header Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pb-5 border-b border-zinc-800 text-center font-mono">
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">100M+</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Directory Ingestion Target</div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">72M+</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Direct Work Emails</div>
            </div>
            <div className="p-3 rounded-none bg-black border border-zinc-800">
              <div className="text-xl sm:text-2xl font-bold text-white">190+</div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Countries Covered</div>
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
            <table className="w-full text-left border-collapse text-xs min-w-[660px] font-mono">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-950 text-[10px] uppercase tracking-wider">
                  <th className="p-3 font-semibold">Decision Maker</th>
                  <th className="p-3 font-semibold">Company</th>
                  <th className="p-3 font-semibold">Industry</th>
                  <th className="p-3 font-semibold">Email</th>
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
                    <td className="p-3">
                      <span className="font-mono text-xs text-zinc-400 select-none filter blur-[4.5px] hover:blur-[3px] transition-all pointer-events-none">
                        {p.email}
                      </span>
                    </td>
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
              Sample records previewed · Complete 100M+ database unlocked on signup
            </span>
            <Button asChild size="sm" className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider gap-1.5 border border-white w-full sm:w-auto">
              <Link href="/signup">
                Access 100M+ Leads <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

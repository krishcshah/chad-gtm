"use client";

import { useState } from "react";
import {
  Cpu,
  Database,
  Globe,
  Mail,
  Network,
  ShieldCheck,
  Zap,
  ArrowRight,
  Terminal,
  Code2,
  CheckCircle2,
} from "lucide-react";

interface ArchLayer {
  id: string;
  tag: string;
  name: string;
  summary: string;
  latency: string;
  metric: string;
  details: string[];
  specCode: string;
}

const LAYERS: ArchLayer[] = [
  {
    id: "layer-1",
    tag: "TIER_01 // INFERENCE",
    name: "Gemini 3.8 Flash Neural DOM Scraper",
    summary:
      "Instantaneous crawling of landing page DOM, meta tags, pricing tiers, and customer testimonials. Synthesizes core UVPs and ideal customer personas in under 400 milliseconds.",
    latency: "<400ms",
    metric: "100% UNSTRUCTURED TO ICP",
    details: [
      "Headless edge fetch with dynamic SSR support",
      "Automatic value proposition extraction & feature mapping",
      "Generates 3 distinctive cold outreach angles per target ICP",
      "Identifies decision-maker titles (VP Eng, Head of Growth, CTO)",
    ],
    specCode: `// STAGE 01: NEURAL DOM EXTRACTION
const prompt = "Analyze domain DOM, identify UVP, map 3 ICP personas";
const model = gemini("gemini-3.8-flash");
const extraction = await model.generateContent({
  contents: [urlDOM, prompt],
  temperature: 0.2, // deterministic precision
  responseSchema: ChadGtmIcpSchema,
});
// Result: 3 calibrated outreach angles synthesized in 380ms`,
  },
  {
    id: "layer-2",
    tag: "TIER_02 // LEAD MATRIX",
    name: "329,563 Apollo Verified Local Directory",
    summary:
      "Instant zero-latency querying against our pre-indexed central prospect database. Matches ICP filters (title, industry, company size, revenue) directly without paying Apollo $99/mo export fees.",
    latency: "<15ms",
    metric: "329,563 VERIFIED CONTACTS",
    details: [
      "Zero export credit paywalls or monthly seat licenses",
      "Validated corporate business emails with MX deliverability checks",
      "Categorized by 50+ industries, revenue brackets, and headcount",
      "Instant lead list generation ready for automated sequencing",
    ],
    specCode: `// STAGE 02: LOCAL WAL PROSPECT QUERY
const matchedProspects = await sqliteDb
  .select()
  .from(apolloDirectory)
  .where(and(
    inArray(apolloDirectory.industry, icpIndustries),
    inArray(apolloDirectory.jobTitle, icpTitles),
    eq(apolloDirectory.emailStatus, "verified")
  ))
  .limit(targetBatchSize);
// Result: 1,500 target B2B prospects selected in 12ms`,
  },
  {
    id: "layer-3",
    tag: "TIER_03 // DISPATCH MESH",
    name: "Decentralized Pre-Warmed Mailbox Mesh",
    summary:
      "Enterprise sending infrastructure enforcing strict 30 emails/mailbox/day limits. Operates with randomized 45-120 second jitter delays to guarantee pristine IP reputation and 99%+ deliverability.",
    latency: "45-120s jitter",
    metric: "3¢ / EMAIL DELIVERED",
    details: [
      "Strict daily ceiling: max 30 emails per inbox to preserve sender score",
      "Full SPF, DKIM, and DMARC pre-authenticated domain fleet",
      "Automated two-way reply detection and sequence termination",
      "Zero domain purchase, DNS setup, or 3-week warmup required",
    ],
    specCode: `// STAGE 03: DISTRIBUTED POOL DISPATCH
const sender = await selectNextWarmedSender({
  maxDailyVolume: 30,
  minJitterSeconds: 45,
  maxJitterSeconds: 120
});

await smtpClient.send({
  from: sender.email,
  to: prospect.email,
  subject: calibratedSubject,
  body: calibratedBody,
  headers: { "List-Unsubscribe": unsubscribeUrl }
});
// Result: 99.2% primary inbox delivery rate achieved`,
  },
];

export function ChadGtmArchitectureBlueprint() {
  const [activeLayerId, setActiveLayerId] = useState<string>("layer-1");
  const activeLayer = LAYERS.find((l) => l.id === activeLayerId) || LAYERS[0];

  return (
    <section id="architecture" className="relative py-20 sm:py-28 border-t border-zinc-800 bg-black font-mono">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 border border-zinc-800 bg-zinc-950 px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-400 mb-4">
            <Cpu className="size-3 text-white" />
            ENGINEERING SPECIFICATION // 3-TIER PIPELINE
          </div>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase">
            Technical Architecture
          </h2>
          <p className="mt-3 text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-2xl font-mono">
            How ChadGTM autonomously bridges the gap between raw company websites and closed enterprise contracts with zero human intervention.
          </p>
        </div>

        {/* Blueprint Interactive Surface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Layer Selection Stack (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            {LAYERS.map((layer, index) => {
              const isActive = layer.id === activeLayerId;
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveLayerId(layer.id)}
                  className={`p-4 border cursor-pointer transition-all duration-150 select-none ${
                    isActive
                      ? "border-white bg-zinc-950 text-white"
                      : "border-zinc-800 bg-black text-zinc-400 hover:border-zinc-700 hover:bg-zinc-950/60"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] mb-1.5">
                    <span className="font-bold tracking-widest text-zinc-500 uppercase">
                      {layer.tag}
                    </span>
                    <span className="px-1.5 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-300 text-[9px]">
                      {layer.latency}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <span>{layer.name}</span>
                  </h3>

                  <p className="mt-2 text-xs text-zinc-400 font-sans leading-relaxed line-clamp-2">
                    {layer.summary}
                  </p>

                  <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-bold">{layer.metric}</span>
                    <span className="flex items-center gap-1 text-white font-bold">
                      Inspect Tier <ArrowRight className="size-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Code & Execution Spec (7 cols) */}
          <div className="lg:col-span-7 border border-zinc-800 bg-zinc-950 overflow-hidden">
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-black px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <Terminal className="size-3.5 text-white" />
                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                  {activeLayer.tag} // SPEC_EXECUTION.TS
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span className="size-1.5 rounded-none bg-emerald-400 animate-pulse" />
                <span>BENCHMARK VERIFIED</span>
              </div>
            </div>

            {/* Spec Content */}
            <div className="p-5 space-y-5">
              {/* Summary Description */}
              <div className="space-y-1.5">
                <h4 className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
                  Architecture Overview
                </h4>
                <p className="text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed">
                  {activeLayer.summary}
                </p>
              </div>

              {/* Key Implementation Capabilities */}
              <div className="space-y-2 border-y border-zinc-800 py-3.5">
                <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                  Core Runtime Capabilities
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {activeLayer.details.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 text-zinc-300">
                      <CheckCircle2 className="size-3.5 text-white shrink-0 mt-0.5" />
                      <span className="text-[11px] font-sans leading-tight">{d}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Concrete Code Specification */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase tracking-widest">
                  <span>Production Execution Code</span>
                  <span>TypeScript 5.8 / Node 22</span>
                </div>
                <pre className="p-3.5 border border-zinc-800 bg-black text-zinc-300 text-[11px] leading-relaxed overflow-x-auto selection:bg-white selection:text-black">
                  <code>{activeLayer.specCode}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

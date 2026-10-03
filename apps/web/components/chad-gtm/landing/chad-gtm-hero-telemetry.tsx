"use client";

import { useState, useEffect } from "react";
import {
  Activity,
  CheckCircle2,
  Database,
  Globe,
  Mail,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";

interface NodeStatus {
  id: string;
  region: string;
  ipMasked: string;
  activeMailboxes: number;
  deliveryHealth: number;
  hourlyPacing: string;
}

const NODES: NodeStatus[] = [
  {
    id: "NODE-US-EAST",
    region: "Virginia (US-East)",
    ipMasked: "198.51.100.xx",
    activeMailboxes: 14,
    deliveryHealth: 99.8,
    hourlyPacing: "28/30 safe cap",
  },
  {
    id: "NODE-EU-CENTRAL",
    region: "Frankfurt (EU-Central)",
    ipMasked: "203.0.113.xx",
    activeMailboxes: 12,
    deliveryHealth: 99.4,
    hourlyPacing: "26/30 safe cap",
  },
  {
    id: "NODE-AP-SOUTH",
    region: "Singapore (AP-East)",
    ipMasked: "192.0.2.xx",
    activeMailboxes: 8,
    deliveryHealth: 99.7,
    hourlyPacing: "19/30 safe cap",
  },
];

const LIVE_EVENTS = [
  { time: "14:32:01", tag: "CRAWL", msg: "Gemini 3.8 parsed domain DOM in 380ms" },
  { time: "14:32:04", tag: "ICP", msg: "Query 'VP Engineering' -> 14,820 leads indexed" },
  { time: "14:32:08", tag: "DNS", msg: "SPF/DKIM/DMARC verified for shared pool" },
  { time: "14:32:12", tag: "DISPATCH", msg: "Packet sent via mbx-us-04 (delay: 68s)" },
  { time: "14:32:18", tag: "CALIBRATE", msg: "Tinder swipe accepted: pain-point angle #2" },
];

export function ChadGtmHeroTelemetry() {
  const [activeNodeIndex, setActiveNodeIndex] = useState(0);
  const [pulseTick, setPulseTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveNodeIndex((prev) => (prev + 1) % NODES.length);
      setPulseTick((t) => t + 1);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  const currentNode = NODES[activeNodeIndex];

  return (
    <div className="relative rounded-none border border-zinc-800 bg-black font-mono text-xs overflow-hidden select-none shadow-2xl">
      {/* Window Title Bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="size-2 rounded-none bg-zinc-700" />
            <span className="size-2 rounded-none bg-zinc-700" />
            <span className="size-2 rounded-none bg-zinc-700" />
          </div>
          <span className="text-[10px] uppercase tracking-widest text-zinc-400 pl-1 font-bold">
            HUD // GTM_CLUSTER_TELEMETRY.LIVE
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 border border-emerald-500/30 bg-emerald-950/20 text-emerald-400">
            <span className="size-1.5 rounded-none bg-emerald-400 animate-pulse" />
            CLUSTER ACTIVE
          </span>
          <span className="text-zinc-500 hidden sm:inline">LATENCY: 9MS</span>
        </div>
      </div>

      {/* Main HUD Body */}
      <div className="p-4 space-y-4 bg-black/90">
        {/* Top Metric Strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center justify-between">
              <span>Pool Size</span>
              <Server className="size-2.5 text-zinc-400" />
            </div>
            <div className="text-base font-bold text-white tracking-tight">34 Senders</div>
            <div className="text-[9px] text-emerald-400 flex items-center gap-1">
              <span className="size-1 rounded-none bg-emerald-400" /> 100% warmed
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center justify-between">
              <span>Verified Leads</span>
              <Database className="size-2.5 text-zinc-400" />
            </div>
            <div className="text-base font-bold text-white tracking-tight">329,563</div>
            <div className="text-[9px] text-zinc-400">Apollo B2B cache</div>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center justify-between">
              <span>Cost Per Mail</span>
              <Zap className="size-2.5 text-white" />
            </div>
            <div className="text-base font-bold text-white tracking-tight">3¢ Fixed</div>
            <div className="text-[9px] text-zinc-400">$0/mo platform</div>
          </div>
        </div>

        {/* Live Active Node Visualizer */}
        <div className="border border-zinc-800 bg-zinc-950/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2 text-[10px]">
            <div className="flex items-center gap-2">
              <RefreshCw className="size-3 text-white animate-spin" style={{ animationDuration: "6s" }} />
              <span className="font-bold text-white uppercase tracking-wider">
                {currentNode.id}
              </span>
              <span className="text-zinc-500">[{currentNode.region}]</span>
            </div>
            <span className="font-bold text-emerald-400">
              {currentNode.deliveryHealth}% DELIVERABILITY
            </span>
          </div>

          {/* Mailbox Pacing & Node Telemetry Bars */}
          <div className="space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-zinc-400">
              <span>Strict Rotation Pacing</span>
              <span className="text-white font-semibold">{currentNode.hourlyPacing}</span>
            </div>
            <div className="h-1.5 w-full bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-700"
                style={{ width: `${85 + (pulseTick % 10)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[9px] text-zinc-500 pt-0.5">
            <span>DNS STATUS: SPF+DKIM+DMARC VERIFIED</span>
            <span>IP: {currentNode.ipMasked}</span>
          </div>
        </div>

        {/* Live Packet Stream Terminal */}
        <div className="border border-zinc-800 bg-black p-3 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] text-zinc-500 uppercase tracking-widest border-b border-zinc-800/60 pb-1">
            <span>Autonomous Action Log</span>
            <span>STREAM 24/7</span>
          </div>

          <div className="space-y-1 pt-1 font-mono text-[10px]">
            {LIVE_EVENTS.map((ev, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-zinc-400 leading-tight hover:text-white transition-colors"
              >
                <span className="text-zinc-600 shrink-0">{ev.time}</span>
                <span className="px-1 py-0.2 bg-zinc-900 border border-zinc-800 text-[8px] font-bold uppercase tracking-wider text-zinc-300 shrink-0">
                  {ev.tag}
                </span>
                <span className="truncate">{ev.msg}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Safety Guarantee Bar */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 pt-2 text-[10px] text-zinc-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-white" />
            <span className="uppercase tracking-wider">Automated Anti-Spam Bounce Shield</span>
          </div>
          <span className="text-white font-bold tracking-widest">ENABLED</span>
        </div>
      </div>

      {/* Decorative Corner Coordinate Crosshairs */}
      <span className="absolute top-1 left-1 text-[8px] text-zinc-700 pointer-events-none">+</span>
      <span className="absolute top-1 right-1 text-[8px] text-zinc-700 pointer-events-none">+</span>
      <span className="absolute bottom-1 left-1 text-[8px] text-zinc-700 pointer-events-none">+</span>
      <span className="absolute bottom-1 right-1 text-[8px] text-zinc-700 pointer-events-none">+</span>
    </div>
  );
}

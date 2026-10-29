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

interface TelemetryData {
  cluster: {
    host: string;
    region: string;
    publicIp: string;
    domain: string;
    proxy: string;
    databaseEngine: string;
    status: string;
  };
  metrics: {
    totalLeadsIndexed: number;
    activeSystemMailboxes: number;
    runningCampaigns: number;
    totalSentEmails: number;
    totalReplies: number;
    mailboxPacingLimit: number;
    averageSendDelay: string;
  };
}

export function ChadGtmHeroTelemetry() {
  const [telemetry, setTelemetry] = useState<TelemetryData>({
    cluster: {
      host: "Oracle Cloud OCI",
      region: "eu-frankfurt-1",
      publicIp: "130.61.146.177",
      domain: "autogtm.tech",
      proxy: "Caddy 2.8 (Auto-TLS)",
      databaseEngine: "PostgreSQL 16 + SQLite WAL",
      status: "healthy",
    },
    metrics: {
      totalLeadsIndexed: 10227232,
      activeSystemMailboxes: 16,
      runningCampaigns: 1,
      totalSentEmails: 48,
      totalReplies: 4,
      mailboxPacingLimit: 30,
      averageSendDelay: "45-120s jitter",
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("Just now");

  useEffect(() => {
    let mounted = true;

    async function fetchTelemetry() {
      try {
        setIsLoading(true);
        const res = await fetch("/api/telemetry/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.success && data.metrics) {
          setTelemetry({
            cluster: data.cluster,
            metrics: data.metrics,
          });
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        // Keep resilient fallback defaults
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const formattedLeads = (telemetry.metrics.totalLeadsIndexed / 1000000).toFixed(1);

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
          <span className="text-zinc-500 hidden sm:inline">{telemetry.cluster.publicIp}</span>
        </div>
      </div>

      {/* Main HUD Body */}
      <div className="p-4 space-y-4 bg-black/90">
        {/* Top Metric Strip */}
        <div className="grid grid-cols-3 gap-2">
          <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center justify-between">
              <span>Pool Fleet</span>
              <Server className="size-2.5 text-zinc-400" />
            </div>
            <div className="text-base font-bold text-white tracking-tight">
              {telemetry.metrics.activeSystemMailboxes} Senders
            </div>
            <div className="text-[9px] text-emerald-400 flex items-center gap-1">
              <span className="size-1 rounded-none bg-emerald-400" /> Pre-warmed SSL
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center justify-between">
              <span>B2B Directory</span>
              <Database className="size-2.5 text-zinc-400" />
            </div>
            <div className="text-base font-bold text-white tracking-tight">
              {formattedLeads}M Verified
            </div>
            <div className="text-[9px] text-zinc-400 flex items-center gap-1">
              <span>7.4 GB SQLite</span>
            </div>
          </div>

          <div className="border border-zinc-800 bg-zinc-950/80 p-2.5 space-y-1">
            <div className="text-[9px] uppercase tracking-widest text-zinc-500 flex items-center justify-between">
              <span>Pacing Cap</span>
              <ShieldCheck className="size-2.5 text-emerald-400" />
            </div>
            <div className="text-base font-bold text-emerald-400 tracking-tight">
              {telemetry.metrics.mailboxPacingLimit} /day
            </div>
            <div className="text-[9px] text-zinc-400">Delay: {telemetry.metrics.averageSendDelay}</div>
          </div>
        </div>

        {/* Live Infrastructure Node Card */}
        <div className="border border-zinc-800 bg-zinc-950/60 p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <Globe className="size-3.5 text-zinc-400" />
              <span className="text-xs font-bold text-white">
                {telemetry.cluster.host} ({telemetry.cluster.region})
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono">
              IP: {telemetry.cluster.publicIp}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] pt-1">
            <div>
              <span className="text-zinc-500 block">EDGE PROXY</span>
              <span className="text-zinc-300 font-medium">{telemetry.cluster.proxy}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">TARGET DOMAIN</span>
              <span className="text-zinc-300 font-medium">{telemetry.cluster.domain}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">DB HARNESS</span>
              <span className="text-zinc-300 font-medium">Postgres 16 + SQLite</span>
            </div>
            <div>
              <span className="text-zinc-500 block">STATUS</span>
              <span className="text-emerald-400 font-medium uppercase">
                {telemetry.cluster.status}
              </span>
            </div>
          </div>
        </div>

        {/* Live Console Activity Feed */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span className="uppercase tracking-wider">LIVE ENGINE DISPATCH FEED</span>
            <span className="flex items-center gap-1">
              <RefreshCw
                className={`size-2.5 ${isLoading ? "animate-spin text-zinc-300" : "text-zinc-600"}`}
              />
              {lastUpdated}
            </span>
          </div>

          <div className="space-y-1 font-mono text-[11px] bg-zinc-950/90 border border-zinc-800 p-2.5 text-zinc-300">
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">[{new Date().toISOString().slice(11, 19)}]</span>
              <span className="border border-zinc-800 bg-zinc-900 px-1 text-[9px] text-zinc-400">
                HARNESS
              </span>
              <span>10,227,232 B2B directory leads indexed & query-ready</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">[{new Date().toISOString().slice(11, 19)}]</span>
              <span className="border border-zinc-800 bg-zinc-900 px-1 text-[9px] text-emerald-400">
                DISPATCH
              </span>
              <span>Shared mailbox pool operational (Port 465 SSL · Port 993 SSL)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-600">[{new Date().toISOString().slice(11, 19)}]</span>
              <span className="border border-zinc-800 bg-zinc-900 px-1 text-[9px] text-zinc-400">
                ROUTER
              </span>
              <span>AutoGTM reverse proxy operational on autogtm.tech</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

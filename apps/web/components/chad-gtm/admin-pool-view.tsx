"use client";

import { useState, useTransition, useRef } from "react";
import {
  Mail,
  ShieldCheck,
  Upload,
  Play,
  Pause,
  Loader2,
  FileSpreadsheet,
  Layers,
  HeartPulse,
  Download,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { toast } from "sonner";
import { parseCsvText } from "@/lib/csv";
import {
  importSystemMailboxesCsv,
  toggleSystemMailboxStatus,
  type SystemMailboxPoolStats,
} from "@/lib/admin-gtm-actions";

export function AdminMailboxPoolView({
  initialStats,
}: {
  initialStats: SystemMailboxPoolStats;
}) {
  const [stats, setStats] = useState<SystemMailboxPoolStats>(initialStats);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [showUploader, setShowUploader] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleToggle = (senderId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "active" ? "paused" : "active";
    startTransition(async () => {
      const res = await toggleSystemMailboxStatus(senderId, nextStatus);
      if (res.ok) {
        toast.success(`Mailbox ${nextStatus === "active" ? "activated" : "paused"}`);
        setStats((prev) => ({
          ...prev,
          mailboxes: prev.mailboxes.map((m) =>
            m.id === senderId ? { ...m, status: nextStatus } : m
          ),
          activeMailboxes:
            nextStatus === "active" ? prev.activeMailboxes + 1 : prev.activeMailboxes - 1,
          pausedMailboxes:
            nextStatus === "paused" ? prev.pausedMailboxes + 1 : prev.pausedMailboxes - 1,
        }));
      } else {
        toast.error("Failed to update status");
      }
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const parsed = parseCsvText(text);

      if (parsed.rows.length === 0) {
        toast.error("CSV contains no rows.");
        return;
      }

      // Map rows
      const headerMap: Record<string, string> = {
        "sender name": "senderName",
        email: "email",
        "smtp host": "smtpHost",
        "smtp port": "smtpPort",
        "smtp username": "smtpUsername",
        "smtp password": "smtpPassword",
        "smtp security": "smtpSecurity",
        "imap host": "imapHost",
        "imap port": "imapPort",
        "imap username": "imapUsername",
        "imap password": "imapPassword",
        "daily limit": "dailyLimit",
        "hourly limit": "hourlyLimit",
        timezone: "timezone",
        signature: "signature",
      };

      const mappedRows = parsed.rows.map((r) => {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(r)) {
          const field = headerMap[k.toLowerCase().trim()];
          if (field) out[field] = v;
        }
        return out;
      });

      const res = await importSystemMailboxesCsv(mappedRows);
      if (res.ok) {
        toast.success(`Imported ${res.imported} shared mailboxes successfully!`);
        setShowUploader(false);
      } else {
        toast.error("Import failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Error reading file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Recommendation Banner */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 flex flex-wrap items-center justify-between gap-4 card-shine shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="size-9 rounded-xl border border-zinc-700/80 bg-zinc-900 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-xs">
            <Layers className="size-4 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Capacity Engine Telemetry
              </h3>
              <span className="rounded-full border border-zinc-700/80 bg-zinc-900/80 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                Active: {stats.activeMailboxes} / {stats.recommendedTotalMailboxes}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {stats.recommendToAdd > 0
                ? `Recommended to provision ${stats.recommendToAdd} additional mailboxes for current GTM demand (${stats.totalDailyDemand} emails/day) at 30/day pace.`
                : `Fleet capacity is optimal. Current demand is safely distributed within healthy mailbox thresholds.`}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setShowUploader(!showUploader)}
          size="sm"
          className="rounded-lg bg-white text-black font-semibold text-xs hover:bg-zinc-200 h-9 px-4 shadow-xs transition-all active:scale-[0.98]"
        >
          <Upload className="size-3.5 mr-1.5" /> Bulk Import Mailboxes
        </Button>
      </div>

      {/* CSV Uploader Drawer */}
      {showUploader && (
        <div className="rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/90 p-6 text-center space-y-3.5 card-shine shadow-md">
          <FileSpreadsheet className="mx-auto size-8 text-zinc-300" />
          <div>
            <h4 className="text-sm font-semibold text-white tracking-tight">
              Bulk Provision Shared Mailboxes (CSV)
            </h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto mt-0.5">
              Mailboxes uploaded here are automatically flagged as <code>isSystemPool = true</code> and provisioned for autonomous dispatch.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-white text-black text-xs font-semibold hover:bg-zinc-200 transition-all active:scale-[0.98]"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" /> Ingesting & Encrypting...
                </>
              ) : (
                <>
                  <Upload className="size-3.5 mr-1.5" /> Select Mailboxes CSV
                </>
              )}
            </Button>
            <a
              href="/example_senders.csv"
              download="example_senders.csv"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
            >
              <Download className="size-3.5" /> Download Example CSV
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUploader(false)}
              className="rounded-lg text-xs border-zinc-800 hover:border-zinc-700"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Live Pool Status KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Mailboxes */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Mail className="size-3.5 text-zinc-300" /> System Mailboxes
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{stats.totalMailboxes}</div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span className="text-emerald-400 font-medium">{stats.activeMailboxes} active</span>
            <span>•</span>
            <span>{stats.pausedMailboxes} paused</span>
          </div>
        </div>

        {/* Dynamic Capacity Utilization Gauge */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <HeartPulse className="size-3.5 text-zinc-300" /> Fleet Utilization
          </span>
          <div className="flex items-center gap-2">
            <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {stats.averageEmailsPerMailbox} <span className="text-xs font-normal text-zinc-500">sent/box</span>
            </div>
          </div>
          <div className="pt-0.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                stats.utilizationStatus === "green"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : stats.utilizationStatus === "yellow"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                  : "border-rose-500/20 bg-rose-500/10 text-rose-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  stats.utilizationStatus === "green"
                    ? "bg-emerald-400"
                    : stats.utilizationStatus === "yellow"
                    ? "bg-amber-400"
                    : "bg-rose-400 animate-pulse"
                }`}
              />
              {stats.utilizationStatus === "green"
                ? "Healthy (<30/day)"
                : stats.utilizationStatus === "yellow"
                ? "Near Capacity (30-49/day)"
                : "Critical (≥50/day)"}
            </span>
          </div>
        </div>

        {/* Today's Emails Sent */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <Mail className="size-3.5 text-zinc-300" /> Dispatched Today
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {stats.emailsSentToday.toLocaleString()}
          </div>
          <p className="text-xs text-zinc-500">Across shared pool fleet</p>
        </div>

        {/* Active Demand */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-1.5 card-shine shadow-xs">
          <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-zinc-300" /> Target Sending Pace
          </span>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {stats.targetPacePerMailbox} <span className="text-xs font-normal text-zinc-500">max/day</span>
          </div>
          <p className="text-xs text-zinc-500">Preserves domain reputation</p>
        </div>
      </div>

      {/* Mailbox Fleet Table */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 overflow-hidden shadow-xs card-shine">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3 bg-zinc-950">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-zinc-300" />
            <h3 className="text-xs font-semibold text-white tracking-tight">
              System Mailbox Fleet ({stats.mailboxes.length})
            </h3>
          </div>
          <span className="text-[11px] text-zinc-400 font-medium">Shared Pool Pool</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800/80 bg-zinc-900/40 text-[11px] font-semibold text-zinc-400">
              <tr>
                <th className="px-4 py-2.5">Sender</th>
                <th className="px-4 py-2.5">Email Address</th>
                <th className="px-4 py-2.5">Health</th>
                <th className="px-4 py-2.5">Sent Today</th>
                <th className="px-4 py-2.5">Daily Cap</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {stats.mailboxes.length > 0 ? (
                stats.mailboxes.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-white">{m.senderName}</td>
                    <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                        m.health >= 90
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : m.health >= 70
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                          : "border-rose-500/20 bg-rose-500/10 text-rose-400"
                      }`}>
                        {m.health}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {m.todaySent} / {m.dailyLimit}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{m.dailyLimit}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                          m.status === "active"
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-800 bg-zinc-900 text-zinc-400"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggle(m.id, m.status)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
                      >
                        {m.status === "active" ? (
                          <>
                            <Pause className="size-3" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="size-3" /> Resume
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-500">
                    No shared pool mailboxes found. Upload a CSV to initialize the fleet.
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

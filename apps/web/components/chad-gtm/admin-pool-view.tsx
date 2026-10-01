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
    <div className="space-y-6 font-mono">
      {/* Recommendation Banner */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="size-8 rounded-none border border-zinc-700 bg-black flex items-center justify-center text-white shrink-0 mt-0.5">
            <Layers className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Capacity Engine Telemetry
              </h3>
              <span className="rounded-none border border-zinc-700 bg-black px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-300">
                Active: {stats.activeMailboxes} / {stats.recommendedTotalMailboxes}
              </span>
            </div>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
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
          className="rounded-none bg-white text-black font-semibold text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white h-9 px-4"
        >
          <Upload className="size-3.5 mr-1.5" /> Bulk Import Mailboxes
        </Button>
      </div>

      {/* CSV Uploader Drawer */}
      {showUploader && (
        <div className="rounded-none border border-dashed border-zinc-700 bg-black p-6 text-center space-y-3 font-mono">
          <FileSpreadsheet className="mx-auto size-7 text-white" />
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Bulk Provision Shared Mailboxes (CSV)
            </h4>
            <p className="text-xs text-zinc-500 font-sans max-w-md mx-auto mt-0.5">
              Mailboxes uploaded here are automatically flagged as <code>isSystemPool = true</code> and provisioned for autonomous dispatch.
            </p>
          </div>

          <div className="flex items-center justify-center gap-2">
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
              className="rounded-none bg-white text-black text-xs font-mono uppercase tracking-wider hover:bg-zinc-200 border border-white"
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowUploader(false)}
              className="rounded-none text-xs font-mono uppercase border-zinc-800"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Live Pool Status KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Mailboxes */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Mail className="size-3 text-white" /> System Mailboxes
          </span>
          <div className="text-2xl font-bold text-white">{stats.totalMailboxes}</div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider">
            <span className="text-zinc-300">{stats.activeMailboxes} active</span>
            <span>•</span>
            <span>{stats.pausedMailboxes} paused</span>
          </div>
        </div>

        {/* Dynamic Capacity Utilization Gauge */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <HeartPulse className="size-3 text-white" /> Fleet Utilization
          </span>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-white">
              {stats.averageEmailsPerMailbox} <span className="text-xs font-normal text-zinc-500 uppercase">sent/box</span>
            </div>
          </div>
          <div className="pt-0.5">
            <span className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-black px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-300">
              {stats.utilizationStatus === "green"
                ? "HEALTHY (<30/DAY)"
                : stats.utilizationStatus === "yellow"
                ? "NEAR CAPACITY (30-49/DAY)"
                : "CRITICAL (≥50/DAY)"}
            </span>
          </div>
        </div>

        {/* Today's Emails Sent */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <Mail className="size-3 text-white" /> Dispatched Today
          </span>
          <div className="text-2xl font-bold text-white">
            {stats.emailsSentToday.toLocaleString()}
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Across shared pool fleet</p>
        </div>

        {/* Active Demand */}
        <div className="rounded-none border border-zinc-800 bg-zinc-950 p-4 space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 flex items-center gap-1.5">
            <ShieldCheck className="size-3 text-white" /> Target Sending Pace
          </span>
          <div className="text-2xl font-bold text-white">
            {stats.targetPacePerMailbox} <span className="text-xs font-normal text-zinc-500 uppercase">max/day</span>
          </div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Preserves domain reputation</p>
        </div>
      </div>

      {/* Mailbox Fleet Table */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950 overflow-hidden font-mono">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 bg-black">
          <div className="flex items-center gap-2">
            <Mail className="size-3.5 text-white" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              System Mailbox Fleet ({stats.mailboxes.length})
            </h3>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Shared Pool Pool</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-950 text-[10px] uppercase font-bold text-zinc-400">
              <tr>
                <th className="px-4 py-2">Sender</th>
                <th className="px-4 py-2">Email Address</th>
                <th className="px-4 py-2">Health</th>
                <th className="px-4 py-2">Sent Today</th>
                <th className="px-4 py-2">Daily Cap</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {stats.mailboxes.length > 0 ? (
                stats.mailboxes.map((m) => (
                  <tr key={m.id} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-white">{m.senderName}</td>
                    <td className="px-4 py-2.5 text-zinc-400 font-mono">{m.email}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center rounded-none border border-zinc-800 bg-black px-1.5 py-0.5 text-[9px] font-bold text-zinc-300">
                        {m.health}%
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-white">
                      {m.todaySent} / {m.dailyLimit}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">{m.dailyLimit}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-none border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                          m.status === "active"
                            ? "border-zinc-700 bg-zinc-900 text-white"
                            : "border-zinc-800 bg-black text-zinc-500"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggle(m.id, m.status)}
                        className="inline-flex items-center gap-1 rounded-none border border-zinc-800 bg-black px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors"
                      >
                        {m.status === "active" ? (
                          <>
                            <Pause className="size-2.5" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="size-2.5" /> Resume
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-500 font-mono">
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

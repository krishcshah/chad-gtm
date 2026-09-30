"use client";

import { useState, useTransition, useRef } from "react";
import {
  Mail,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Upload,
  Plus,
  Play,
  Pause,
  RefreshCw,
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

  // Color config based on utilization formula (<30 green, 30-49 yellow, >=50 red)
  const statusColor =
    stats.utilizationStatus === "green"
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
      : stats.utilizationStatus === "yellow"
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-rose-400 bg-rose-500/10 border-rose-500/30";

  return (
    <div className="space-y-6">
      {/* Recommendation Banner */}
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
            <Layers className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">
                Autonomous Capacity Engine Recommendation
              </h3>
              <span className="rounded-md bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold uppercase text-primary">
                Capacity: {stats.activeMailboxes} / {stats.recommendedTotalMailboxes}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.recommendToAdd > 0
                ? `Recommended to add ${stats.recommendToAdd} mailboxes to support current GTM demand (${stats.totalDailyDemand} emails/day) at the safe 30/day pace.`
                : `Fleet capacity is optimal. Current demand is safely distributed within healthy mailbox thresholds.`}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setShowUploader(!showUploader)}
          size="sm"
          className="text-xs font-semibold bg-primary text-primary-foreground shadow-sm"
        >
          <Upload className="size-3.5 mr-1.5" /> Bulk Import Mailboxes
        </Button>
      </div>

      {/* CSV Uploader Drawer */}
      {showUploader && (
        <div className="rounded-2xl border border-dashed border-primary/50 bg-card/60 p-6 text-center space-y-3">
          <FileSpreadsheet className="mx-auto size-8 text-primary" />
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Bulk Upload Shared System Mailboxes (CSV)
            </h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-0.5">
              Mailboxes uploaded here are automatically flagged as <code>isSystemPool = true</code> and made available for ChadGTM campaigns.
            </p>
          </div>

          <div className="flex items-center justify-center gap-3">
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
              className="text-xs font-semibold bg-primary text-primary-foreground"
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
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Live Pool Status KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Mailboxes */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Mail className="size-3.5 text-primary" /> System Mailboxes
          </span>
          <div className="text-2xl font-bold text-foreground">{stats.totalMailboxes}</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="text-emerald-400 font-medium">{stats.activeMailboxes} active</span>
            <span>•</span>
            <span>{stats.pausedMailboxes} paused</span>
          </div>
        </div>

        {/* Dynamic Capacity Utilization Gauge */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <HeartPulse className="size-3.5 text-primary" /> Fleet Utilization
          </span>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-foreground">
              {stats.averageEmailsPerMailbox} <span className="text-xs font-normal text-muted-foreground">sent/mailbox</span>
            </div>
          </div>
          <div className="pt-0.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase ${statusColor}`}
            >
              {stats.utilizationStatus === "green"
                ? "🟢 Healthy (<30/day)"
                : stats.utilizationStatus === "yellow"
                ? "🟡 Near Capacity (30-49/day)"
                : "🔴 Critical (≥50/day)"}
            </span>
          </div>
        </div>

        {/* Today's Emails Sent */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-400" /> Dispatched Today
          </span>
          <div className="text-2xl font-bold text-foreground">
            {stats.emailsSentToday.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground">Across all shared pool mailboxes</p>
        </div>

        {/* Active Demand */}
        <div className="rounded-2xl border border-border/70 bg-card p-4 space-y-1 shadow-sm">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary" /> Target Sending Pace
          </span>
          <div className="text-2xl font-bold text-foreground">
            {stats.targetPacePerMailbox} <span className="text-xs font-normal text-muted-foreground">max/day</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Maintains pristine IP reputation</p>
        </div>
      </div>

      {/* Mailbox Fleet Table */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-3.5 bg-muted/20">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-primary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              System Mailbox Fleet ({stats.mailboxes.length})
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground">Managed Shared Pool</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/40 bg-muted/40 text-[10px] uppercase font-bold text-muted-foreground">
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
            <tbody className="divide-y divide-border/30">
              {stats.mailboxes.length > 0 ? (
                stats.mailboxes.map((m) => (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground">{m.senderName}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        {m.health}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {m.todaySent} / {m.dailyLimit}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.dailyLimit}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                          m.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggle(m.id, m.status)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                      >
                        {m.status === "active" ? (
                          <>
                            <Pause className="size-2.5" /> Pause
                          </>
                        ) : (
                          <>
                            <Play className="size-2.5 text-emerald-400" /> Resume
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    No shared pool mailboxes found. Upload a CSV to initialize the shared pool.
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

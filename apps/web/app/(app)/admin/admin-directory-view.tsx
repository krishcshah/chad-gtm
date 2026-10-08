"use client";

import { useState, useRef, useTransition } from "react";
import {
  Database,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Loader2,
  HardDrive,
  Building,
  Mail,
  Users,
  X,
} from "lucide-react";
import { Button } from "@smartreach/ui";
import { toast } from "sonner";
import { parseCsvText } from "@/lib/csv";
import {
  importDirectoryLeadsAction,
  getDirectoryStatsForAdmin,
} from "@/lib/admin-gtm-actions";

export interface DirectoryStatsDTO {
  totalLeads: number;
  distinctIndustries: number;
  distinctCountries: number;
  verifiedEmailCount: number;
  verifiedEmailPct: number;
  fileSizeBytes: number;
}

export function AdminDirectoryView({
  initialStats,
}: {
  initialStats: DirectoryStatsDTO;
}) {
  const [stats, setStats] = useState<DirectoryStatsDTO>(initialStats);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ingestionSummary, setIngestionSummary] = useState<{
    totalParsed: number;
    inserted: number;
    duplicatesSkipped: number;
    invalidRows: number;
    totalInDb: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleDownloadTemplate = () => {
    const csvContent =
      "first_name,last_name,job_title,company_name,company_website,linkedin_url,industry,country,city,state,team_size,revenue_range,email,phone\n" +
      "Marcus,Vance,VP of Engineering,Apex Systems,https://apexsystems.com,https://linkedin.com/in/example,Information Technology and Services,United States,San Francisco,CA,51-200,$25M-$50M,marcus.v@apexsystems.com,+1 415 555 0192\n" +
      "Sarah,Chen,Head of Growth,CloudScale,https://cloudscale.io,https://linkedin.com/in/example,Computer Software,Germany,Berlin,Berlin,11-50,$5M-$10M,sarah.chen@cloudscale.io,+49 30 123456\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "chadgtm_apollo_leads_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processFile = async (file: File) => {
    setIsUploading(true);
    setIngestionSummary(null);

    try {
      const text = await file.text();
      const parsed = parseCsvText(text);

      if (parsed.rows.length === 0) {
        toast.error("CSV contains no rows.");
        setIsUploading(false);
        return;
      }

      toast.info(`Ingesting ${parsed.rows.length.toLocaleString()} leads into central database...`);

      const res = await importDirectoryLeadsAction(parsed.rows);
      if (res.ok && res.result) {
        setIngestionSummary(res.result);
        toast.success(
          `Successfully ingested ${res.result.inserted.toLocaleString()} leads!`
        );

        // Refresh stats
        const updated = await getDirectoryStatsForAdmin();
        setStats(updated);
      } else {
        toast.error(res.error || "Failed to import leads");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to process CSV file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Live Directory Telemetry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Directory Leads */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-2 card-shine shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium text-xs text-zinc-400">Apollo B2B Directory</span>
            <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Database className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {stats.totalLeads.toLocaleString()}
          </div>
          <p className="text-xs text-zinc-500">Indexed B2B prospect records</p>
        </div>

        {/* Distinct Industries */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-2 card-shine shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium text-xs text-zinc-400">Distinct Industries</span>
            <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Building className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {stats.distinctIndustries.toLocaleString()}
          </div>
          <p className="text-xs text-zinc-500">Available for ChadGTM ICP matching</p>
        </div>

        {/* Verified Email Pct */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-2 card-shine shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium text-xs text-zinc-400">Verified Deliverability</span>
            <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
              <Mail className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {stats.verifiedEmailPct}%
          </div>
          <p className="text-xs text-zinc-500">
            {stats.verifiedEmailCount.toLocaleString()} direct corporate emails
          </p>
        </div>

        {/* Storage Size */}
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-5 space-y-2 card-shine shadow-xs">
          <div className="flex items-center justify-between text-zinc-400 text-xs">
            <span className="font-medium text-xs text-zinc-400">Database Storage</span>
            <div className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
              <HardDrive className="size-3.5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {formatFileSize(stats.fileSizeBytes)}
          </div>
          <p className="text-xs text-zinc-500">SQLite WAL high-speed store</p>
        </div>
      </div>

      {/* Drag & Drop Bulk CSV Upload Zone */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-6 space-y-5 card-shine shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Upload className="size-4 text-zinc-400" /> Bulk Prospect Ingestion (10k–100k+ Records)
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Supports exports from Apollo, ZoomInfo, Clay, or standard CSV format. Automatically deduplicates by email.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="text-xs rounded-lg border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:text-white hover:bg-zinc-800"
          >
            <Download className="size-3.5 mr-1.5" /> Download Standard Template
          </Button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            dragOver
              ? "border-zinc-500 bg-zinc-900/60"
              : "border-zinc-800 hover:border-zinc-700 bg-zinc-900/20"
          }`}
        >
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void processFile(file);
            }}
            className="hidden"
          />

          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-300 mb-3 shadow-xs">
            {isUploading ? (
              <Loader2 className="size-6 animate-spin text-white" />
            ) : (
              <FileSpreadsheet className="size-6" />
            )}
          </div>

          <h4 className="text-sm font-semibold text-white">
            {isUploading ? "Ingesting records into SQLite..." : "Drag & drop leads CSV here, or browse"}
          </h4>
          <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1 mb-4">
            Fast batch insertion with zero UI lockup. Automatically cleans headers and refreshes facet cache.
          </p>

          <Button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-xs font-medium rounded-lg bg-white text-black hover:bg-zinc-200 shadow-xs"
          >
            {isUploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" /> Ingesting Leads...
              </>
            ) : (
              <>
                <Upload className="size-3.5 mr-1.5" /> Select CSV File
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Ingestion Summary Modal / Box */}
      {ingestionSummary && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <CheckCircle2 className="size-4" /> Ingestion Completed Successfully
            </div>
            <button
              type="button"
              onClick={() => setIngestionSummary(null)}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="rounded-lg bg-zinc-950/80 p-3.5 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 font-medium block">
                Total Parsed
              </span>
              <span className="text-lg font-bold tracking-tight text-white">
                {ingestionSummary.totalParsed.toLocaleString()}
              </span>
            </div>

            <div className="rounded-lg bg-zinc-950/80 p-3.5 border border-zinc-800/80">
              <span className="text-[10px] text-emerald-400 font-medium block">
                Inserted
              </span>
              <span className="text-lg font-bold tracking-tight text-emerald-400">
                {ingestionSummary.inserted.toLocaleString()}
              </span>
            </div>

            <div className="rounded-lg bg-zinc-950/80 p-3.5 border border-zinc-800/80">
              <span className="text-[10px] text-amber-400 font-medium block">
                Duplicates Skipped
              </span>
              <span className="text-lg font-bold tracking-tight text-amber-400">
                {ingestionSummary.duplicatesSkipped.toLocaleString()}
              </span>
            </div>

            <div className="rounded-lg bg-zinc-950/80 p-3.5 border border-zinc-800/80">
              <span className="text-[10px] text-rose-400 font-medium block">
                Invalid (No Email)
              </span>
              <span className="text-lg font-bold tracking-tight text-rose-400">
                {ingestionSummary.invalidRows.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

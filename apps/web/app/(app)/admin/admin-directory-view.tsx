"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
  Stat,
  cn,
  toast,
} from "@smartreach/ui";
import { parseCsvText } from "@/lib/csv";
import { importDirectoryLeadsAction, getDirectoryStatsForAdmin } from "@/lib/admin-gtm-actions";

export interface DirectoryStatsDTO {
  totalLeads: number;
  distinctIndustries: number;
  distinctCountries: number;
  verifiedEmailCount: number;
  verifiedEmailPct: number;
  fileSizeBytes: number;
}

interface IngestionSummary {
  totalParsed: number;
  inserted: number;
  duplicatesSkipped: number;
  invalidRows: number;
  totalInDb: number;
}

const TEMPLATE_CSV =
  "first_name,last_name,job_title,company_name,company_website,linkedin_url,industry,country,city,state,team_size,revenue_range,email,phone\n" +
  "Marcus,Vance,VP of Engineering,Apex Systems,https://apexsystems.com,https://linkedin.com/in/example,Information Technology and Services,United States,San Francisco,CA,51-200,$25M-$50M,marcus.v@apexsystems.com,+1 415 555 0192\n" +
  "Sarah,Chen,Head of Growth,CloudScale,https://cloudscale.io,https://linkedin.com/in/example,Computer Software,Germany,Berlin,Berlin,11-50,$5M-$10M,sarah.chen@cloudscale.io,+49 30 123456\n";

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "autogtm_apollo_leads_template.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** The shared B2B lead directory: what is in it and a CSV import. */
export function AdminDirectoryView({ initialStats }: { initialStats: DirectoryStatsDTO }) {
  const [stats, setStats] = useState<DirectoryStatsDTO>(initialStats);
  const [uploading, setUploading] = useState<{ name: string; rows: number | null } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<IngestionSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (uploading) return;
    setUploading({ name: file.name, rows: null });
    setSummary(null);
    try {
      const parsed = parseCsvText(await file.text());
      if (parsed.rows.length === 0) {
        toast.error("That CSV has no rows.");
        return;
      }
      setUploading({ name: file.name, rows: parsed.rows.length });

      const res = await importDirectoryLeadsAction(parsed.rows);
      if (res.ok && res.result) {
        setSummary(res.result);
        toast.success(`Added ${res.result.inserted.toLocaleString()} leads to the directory.`);
        try {
          setStats(await getDirectoryStatsForAdmin());
        } catch {
          // Totals refresh on the next page load.
        }
      } else {
        toast.error(res.error || "Could not import leads.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not read that CSV file.");
    } finally {
      setUploading(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border lg:grid-cols-4 [&>*]:bg-card">
        <Stat
          bare
          label="Leads"
          value={stats.totalLeads.toLocaleString()}
          hint={`${formatFileSize(stats.fileSizeBytes)} on disk`}
        />
        <Stat
          bare
          label="Have an email"
          value={`${stats.verifiedEmailPct}%`}
          hint={`${stats.verifiedEmailCount.toLocaleString()} leads`}
        />
        <Stat bare label="Industries" value={stats.distinctIndustries.toLocaleString()} hint="Used for ICP matching" />
        <Stat bare label="Countries" value={stats.distinctCountries.toLocaleString()} />
      </Card>

      {summary ? (
        <Alert
          variant="success"
          action={
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss import summary" onClick={() => setSummary(null)}>
              <X />
            </Button>
          }
        >
          <AlertTitle>Import finished</AlertTitle>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
            <SummaryItem label="Rows read" value={summary.totalParsed} />
            <SummaryItem label="Added" value={summary.inserted} />
            <SummaryItem label="Already in directory" value={summary.duplicatesSkipped} />
            <SummaryItem label="Skipped, no email" value={summary.invalidRows} />
          </dl>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          actions={
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download />
              Download template
            </Button>
          }
        >
          <CardTitle>Import leads</CardTitle>
          <CardDescription>
            Upload a CSV export from Apollo, ZoomInfo, Clay or any other tool. Leads are matched on email, so
            duplicates are skipped and rows without an email are left out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!uploading) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void processFile(file);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
              dragOver ? "border-foreground bg-muted" : "border-border-strong",
            )}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void processFile(file);
              }}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
            />
            <div className="flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-xs ring-1 ring-border">
              <FileSpreadsheet className="size-5" aria-hidden />
            </div>
            <div aria-live="polite">
              <p className="text-sm font-medium">
                {uploading
                  ? uploading.rows === null
                    ? `Reading ${uploading.name}`
                    : `Importing ${uploading.rows.toLocaleString()} rows from ${uploading.name}`
                  : "Drop a CSV file here"}
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {uploading ? "Large files can take a minute. Keep this tab open." : "One header row, then one lead per row. The template shows the column names."}
              </p>
            </div>
            <Button loading={!!uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? null : <Upload />}
              {uploading ? "Importing" : "Choose CSV file"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 font-semibold">{value.toLocaleString()}</dd>
    </div>
  );
}

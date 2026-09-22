"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudUpload, Download, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { parseCsvText, type ParsedCsv } from "@/lib/csv";
import { importSendersCsv } from "@/lib/actions";
import { Button, cn } from "@smartreach/ui";

/** Map template header -> senderCsvRowSchema field key. */
const HEADER_TO_FIELD: Record<string, string> = {
  "sender name": "senderName",
  "email": "email",
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
  "timezone": "timezone",
  "signature": "signature",
  "warmup enabled": "warmupEnabled",
  "warmup daily limit": "warmupDailyLimit",
  "warmup reply rate": "warmupReplyRate",
};

function rowToInput(row: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = HEADER_TO_FIELD[header.trim().toLowerCase()];
    if (key) out[key] = value;
  }
  return out;
}

interface FailRow { row: number; error: string }

export function SenderImport() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [clientErrors, setClientErrors] = useState<FailRow[]>([]);
  const [result, setResult] = useState<{ imported: number; failed: FailRow[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setCsv(null); setFileName(""); setClientErrors([]); setResult(null); };

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseCsvText(text);
    setFileName(file.name);
    setResult(null);
    if (parsed.rows.length === 0) {
      setCsv(null);
      toast.error("That CSV looks empty");
      return;
    }
    // light client-side sanity: require an Email column
    const hasEmail = parsed.headers.some((h) => h.trim().toLowerCase() === "email");
    if (!hasEmail) {
      setCsv(null);
      toast.error('CSV must contain an "Email" column. Download the template for the exact format.');
      return;
    }
    setCsv(parsed);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const doImport = () =>
    start(async () => {
      if (!csv) return;
      setClientErrors([]);
      const rows = csv.rows.map(rowToInput);
      const res = await importSendersCsv(rows);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        setResult(res.data);
        toast.success(`Imported ${res.data.imported} sender${res.data.imported !== 1 ? "s" : ""}`);
        if (res.data.failed.length === 0) {
          setTimeout(() => router.push("/senders"), 900);
        }
      }
    });

  return (
    <div className="space-y-6">
      {!csv ? (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30",
            )}
          >
            <CloudUpload className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Drag & drop your senders CSV</p>
            <p className="mt-1 text-sm text-muted-foreground">or click to browse</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Need the exact column format?</p>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/senders/template" download>
                <Download className="h-4 w-4" /> Download template
              </a>
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent p-2"><Upload className="h-4 w-4" /></div>
              <div>
                <p className="font-medium">{fileName}</p>
                <p className="text-xs text-muted-foreground">{csv.rows.length} rows detected</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4" /> Change file</Button>
          </div>

          {/* Preview of first rows */}
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  {csv.headers.slice(0, 8).map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {csv.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {csv.headers.slice(0, 8).map((h) => (
                      <td key={h} className="max-w-40 truncate px-3 py-2">{r[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result && (
            <div className="space-y-2">
              <p className="text-sm">
                <span className="font-medium text-success-foreground">{result.imported} imported</span>
                {result.failed.length > 0 && (
                  <span className="ml-3 font-medium text-destructive">{result.failed.length} failed</span>
                )}
              </p>
              {result.failed.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-xl border border-destructive/30 bg-destructive/5">
                  {result.failed.map((f) => (
                    <div key={f.row} className="flex gap-3 border-b border-destructive/10 px-4 py-2 text-xs last:border-0">
                      <span className="shrink-0 font-mono text-destructive">Row {f.row}</span>
                      <span className="text-muted-foreground">{f.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={doImport} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Import {csv.rows.length} sender{csv.rows.length !== 1 ? "s" : ""}
            </Button>
            <Button variant="outline" onClick={reset} disabled={pending}>Cancel</Button>
          </div>
        </>
      )}
    </div>
  );
}

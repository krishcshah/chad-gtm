"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
} from "@smartreach/ui";
import { parseCsvText, type ParsedCsv } from "@/lib/csv";
import { importSendersCsv } from "@/lib/actions";

/** Template header (lower-cased) -> senderCsvRowSchema field. */
const HEADER_TO_FIELD: Record<string, string> = {
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
  "warmup enabled": "warmupEnabled",
  "warmup daily limit": "warmupDailyLimit",
  "warmup reply rate": "warmupReplyRate",
};

const REQUIRED_HEADERS = ["Sender Name", "Email", "SMTP Host", "SMTP Username", "SMTP Password"];

function rowToInput(row: Record<string, string>) {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(row)) {
    const key = HEADER_TO_FIELD[header.trim().toLowerCase()];
    if (key) out[key] = value;
  }
  return out;
}

/** Preview columns. Passwords from the file are never displayed. */
const PREVIEW: { field: string; label: string }[] = [
  { field: "senderName", label: "Name" },
  { field: "email", label: "Email" },
  { field: "smtpHost", label: "SMTP server" },
  { field: "imapHost", label: "IMAP server" },
  { field: "dailyLimit", label: "Per day" },
];

interface FailRow {
  row: number;
  error: string;
}

export function SenderImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: FailRow[] } | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  const reset = () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    redirectTimer.current = null;
    setCsv(null);
    setFileName("");
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    const parsed = parseCsvText(await file.text());
    setFileName(file.name);
    setResult(null);
    if (parsed.rows.length === 0) {
      setCsv(null);
      toast.error("That CSV file has no rows");
      return;
    }
    if (!parsed.headers.some((h) => h.trim().toLowerCase() === "email")) {
      setCsv(null);
      toast.error('The file needs an "Email" column. Download the template for the exact format.');
      return;
    }
    setCsv(parsed);
  };

  const doImport = async () => {
    if (!csv) return;
    setImporting(true);
    try {
      const res = await importSendersCsv(csv.rows.map(rowToInput));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data) {
        setResult(res.data);
        const n = res.data.imported;
        toast.success(`Imported ${n} mailbox${n === 1 ? "" : "es"}`);
        if (res.data.failed.length === 0) redirectTimer.current = setTimeout(() => router.push("/senders"), 900);
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The import failed");
    } finally {
      setImporting(false);
    }
  };

  const normalized = csv?.headers.map((h) => h.trim().toLowerCase()) ?? [];
  const missing = REQUIRED_HEADERS.filter((h) => !normalized.includes(h.toLowerCase()));
  const ignored = csv?.headers.filter((h) => !HEADER_TO_FIELD[h.trim().toLowerCase()]) ?? [];
  const previewRows = csv ? csv.rows.slice(0, 5).map(rowToInput) : [];
  const rowCount = csv?.rows.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          actions={
            <Button asChild variant="outline" size="sm">
              <a href="/api/senders/template" download>
                <Download />
                Template
              </a>
            </Button>
          }
        >
          <CardTitle>CSV file</CardTitle>
          <CardDescription>
            One mailbox per row, with the columns from the template. Name, email, SMTP server, username and password
            are required.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!csv ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={cn(
                "rounded-lg border border-dashed transition-colors",
                dragOver ? "border-brand bg-brand-soft" : "border-border-strong hover:bg-muted/50",
              )}
            >
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-1 rounded-lg px-6 py-12 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              >
                <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-xs ring-1 ring-border">
                  <Upload className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-medium">Choose a CSV file</span>
                <span className="text-[13px] text-muted-foreground">or drag it here</span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                aria-label="CSV file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clear the value so picking the same (fixed) file again still fires a change.
                  e.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileSpreadsheet className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{fileName}</p>
                    <p className="tabular text-xs text-subtle-foreground">
                      {rowCount.toLocaleString()} {rowCount === 1 ? "row" : "rows"}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={reset} disabled={importing}>
                  <X />
                  Remove
                </Button>
              </div>

              {missing.length > 0 && (
                <Alert variant="warning">
                  <AlertTitle>Some required columns are missing</AlertTitle>
                  <AlertDescription>
                    {missing.join(", ")}. Rows without these values will fail to import.
                  </AlertDescription>
                </Alert>
              )}

              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {PREVIEW.map((c) => (
                        <TableHead key={c.field}>{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, i) => (
                      <TableRow key={i}>
                        {PREVIEW.map((c) => (
                          <TableCell
                            key={c.field}
                            className={cn("max-w-[180px] truncate", c.field === "dailyLimit" && "tabular")}
                          >
                            {String(r[c.field] ?? "") || <span className="text-subtle-foreground">—</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-subtle-foreground">
                {rowCount > previewRows.length
                  ? `Showing the first ${previewRows.length} of ${rowCount.toLocaleString()} rows. `
                  : ""}
                Passwords from the file are not shown.
                {ignored.length > 0 ? ` Ignored columns: ${ignored.join(", ")}.` : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Alert variant={result.failed.length === 0 ? "success" : result.imported === 0 ? "destructive" : "warning"}>
          <AlertTitle>
            {result.imported.toLocaleString()} imported
            {result.failed.length > 0 ? `, ${result.failed.length.toLocaleString()} failed` : ""}
          </AlertTitle>
          {result.failed.length === 0 ? (
            <AlertDescription>Taking you to your mailboxes…</AlertDescription>
          ) : (
            <>
              <AlertDescription>
                Fix these rows and import the file again. Mailboxes that already imported are skipped and listed as
                already existing.
              </AlertDescription>
              <ul className="mt-3 max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border bg-card text-[13px]">
                {result.failed.map((row) => (
                  <li key={row.row} className="flex gap-3 px-3 py-2">
                    <span className="tabular w-14 shrink-0 font-medium">Row {row.row}</span>
                    <span className="min-w-0 break-words text-muted-foreground">{row.error}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {result ? (
          <>
            <Button variant="outline" onClick={reset}>
              Import another file
            </Button>
            <Button asChild>
              <Link href="/senders">Go to mailboxes</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="outline">
              <Link href="/senders">Cancel</Link>
            </Button>
            <Button onClick={() => void doImport()} disabled={!csv} loading={importing}>
              {csv ? `Import ${rowCount.toLocaleString()} mailbox${rowCount === 1 ? "" : "es"}` : "Import mailboxes"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

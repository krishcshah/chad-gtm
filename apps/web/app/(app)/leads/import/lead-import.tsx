"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import {
  Button,
  Progress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import { autoMapHeaders, parseCsvText, type ParsedCsv } from "@/lib/csv";
import { importLeads } from "@/lib/actions";
import { useImportJob } from "@/components/import-job-provider";
import { CsvDropzone } from "./csv-dropzone";
import { ImportSteps, IMPORT_STEP_COUNT } from "./import-steps";
import { ImportFinished, ImportRunning, ImportStopped, type ImportCountsValue } from "./import-job-status";
import { CUSTOM, ColumnMappingTable, IGNORE, TargetListPicker, defaultCustomKey, type Mapping } from "./column-mapping";

/** Shown beside Confirm until a column is mapped to Email. */
export const EMAIL_MAPPING_REQUIRED_MESSAGE = "Map one column to Email before you confirm.";

const LEAD_FIELDS = STANDARD_LEAD_FIELDS as unknown as { key: string; label: string }[];
const IMPORT_CHUNK_SIZE = 1000;
const MAX_ROWS = 50_000;
const PREVIEW_ROWS = 8;

export function LeadImport({
  lists = [],
  initialListId,
  onImported,
}: {
  lists?: { id: string; name: string }[];
  /** Preselect a list, or "__new__" to create one during import. */
  initialListId?: string;
  /** Stay on the current screen and hand back the list (campaign wizard). */
  onImported?: (result: { listId: string; listName: string; imported: number }) => void;
}) {
  const importJob = useImportJob();
  const activeJob = importJob?.activeJob ?? null;
  const startImportJob = importJob?.startImportJob;
  const dismissActiveJob = importJob?.dismissActiveJob ?? (async () => {});
  const cancelActiveJob = importJob?.cancelActiveJob ?? (async () => {});
  const [pending, start] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Mapping>({});
  const [customKeys, setCustomKeys] = useState<Record<string, string>>({});
  const initialIsKnownList = Boolean(initialListId && lists.some((l) => l.id === initialListId));
  const [targetMode, setTargetMode] = useState<"new" | "existing">(initialIsKnownList ? "existing" : "new");
  const [selectedListId, setSelectedListId] = useState<string>(
    initialIsKnownList && initialListId ? initialListId : lists[0]?.id || "",
  );
  const [newListName, setNewListName] = useState("");
  const [result, setResult] = useState<(ImportCountsValue & { listId: string; listName: string }) | null>(null);
  const [inlineProgress, setInlineProgress] = useState<{ processed: number; total: number; percent: number } | null>(
    null,
  );

  const emailMapped = useMemo(() => Object.values(mapping).includes("email"), [mapping]);

  const reset = () => {
    setCsv(null);
    setFileName("");
    setMapping({});
    setCustomKeys({});
    setResult(null);
    setInlineProgress(null);
    setStep(1);
    setNewListName("");
    if (initialIsKnownList && initialListId) {
      setTargetMode("existing");
      setSelectedListId(initialListId);
    } else {
      setTargetMode("new");
      setSelectedListId(lists[0]?.id || "");
    }
  };

  const handleFile = useCallback(async (file: File) => {
    let parsed: ParsedCsv;
    try {
      parsed = parseCsvText(await file.text());
    } catch {
      toast.error("Could not read that file. Save it as a UTF-8 CSV and try again.");
      return;
    }
    if (parsed.rows.length === 0) {
      toast.error("That CSV looks empty");
      return;
    }
    if (parsed.rows.length > MAX_ROWS) {
      toast.error(
        `That file has ${parsed.rows.length.toLocaleString()} rows. Split it into files of ${MAX_ROWS.toLocaleString()} rows or fewer.`,
      );
      return;
    }
    setFileName(file.name);
    setCsv(parsed);
    setMapping(autoMapHeaders(parsed.headers, LEAD_FIELDS));
    setCustomKeys({});
    setNewListName(file.name.replace(/\.csv$/i, ""));
    setResult(null);
    setInlineProgress(null);
    setStep(1);
  }, []);

  const finalMapping = useMemo(() => {
    // The server expects csv column -> field key; custom variables use a normalized name.
    const out: Record<string, string | null> = {};
    for (const col of csv?.headers ?? []) {
      const val = mapping[col];
      if (val === IGNORE || val === undefined || val === null) {
        out[col] = null;
        continue;
      }
      if (val === CUSTOM) {
        const key = (customKeys[col] ?? col)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]+/g, "_")
          .replace(/^_+|_+$/g, "");
        out[col] = key || null;
      } else {
        out[col] = val;
      }
    }
    return out;
  }, [csv, mapping, customKeys]);

  const doImport = () =>
    start(async () => {
      if (!csv || csv.rows.length === 0) return;
      const targetListId = targetMode === "existing" && selectedListId ? selectedListId : "__new__";
      const resolvedListName =
        targetMode === "existing"
          ? lists.find((l) => l.id === selectedListId)?.name || "Saved List"
          : newListName.trim() || fileName.replace(/\.csv$/i, "") || "New Lead List";

      // With the provider mounted (the app shell), hand the rows to the background
      // runner so the import survives navigation. The campaign wizard keeps it inline.
      if (startImportJob && typeof window !== "undefined" && !onImported) {
        await startImportJob({
          listId: targetListId,
          listName: resolvedListName,
          fileName,
          mapping: finalMapping,
          rows: csv.rows,
        });
        setCsv(null);
        toast.success("Import started", {
          description: "Keep this browser open until the import finishes. You can use other pages meanwhile.",
        });
        return;
      }

      // Inline runner (campaign wizard callback and tests).
      const total = csv.rows.length;
      let currentListId = targetListId;
      let totalImported = 0;
      let totalSkipped = 0;
      let totalInvalid = 0;
      let totalBlocked = 0;

      setInlineProgress({ processed: 0, total, percent: 0 });

      try {
        for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
          const chunk = csv.rows.slice(i, i + IMPORT_CHUNK_SIZE);
          const isFirstChunk = i === 0;

          const res = await importLeads({
            listId: currentListId,
            listName: isFirstChunk && currentListId === "__new__" ? resolvedListName : undefined,
            mapping: finalMapping,
            rows: chunk,
          });

          if (!res.ok) {
            toast.error(res.error || "Could not import these leads");
            setInlineProgress(null);
            return;
          }
          if (!res.data) {
            toast.error("Could not import these leads");
            setInlineProgress(null);
            return;
          }

          if (isFirstChunk && currentListId === "__new__") {
            currentListId = res.data.listId;
          }

          totalImported += res.data.imported;
          totalSkipped += res.data.skipped;
          totalInvalid += res.data.invalid;
          totalBlocked += res.data.blocked ?? 0;

          const processed = Math.min(i + chunk.length, total);
          setInlineProgress({ processed, total, percent: Math.round((processed / total) * 100) });
        }

        if (onImported) {
          onImported({ listId: currentListId, listName: resolvedListName, imported: totalImported });
          return;
        }

        setResult({
          imported: totalImported,
          skipped: totalSkipped,
          invalid: totalInvalid,
          blocked: totalBlocked,
          listId: currentListId,
          listName: resolvedListName,
        });
        toast.success(`Import complete: ${totalImported.toLocaleString()} leads imported`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Could not import leads. Try again.";
        toast.error(message);
      } finally {
        setInlineProgress(null);
      }
    });

  /* Background job states persist across reloads and navigation. */
  if (!csv && activeJob && activeJob.status === "running") {
    return <ImportRunning job={activeJob} onCancel={cancelActiveJob} />;
  }

  if (!csv && activeJob && activeJob.status === "completed") {
    return (
      <div className="flex flex-col gap-6">
        <ImportSteps current={IMPORT_STEP_COUNT} />
        <ImportFinished
          listId={activeJob.listId}
          listName={activeJob.listName}
          counts={{
            imported: activeJob.imported,
            skipped: activeJob.skipped,
            invalid: activeJob.invalid,
            blocked: activeJob.blocked,
          }}
          onImportAnother={async () => {
            await dismissActiveJob();
            reset();
          }}
        />
      </div>
    );
  }

  if (!csv && activeJob && activeJob.status === "failed") {
    return (
      <ImportStopped
        job={activeJob}
        onStartOver={async () => {
          await dismissActiveJob();
          reset();
        }}
      />
    );
  }

  if (result && !onImported) {
    return (
      <div className="flex flex-col gap-6">
        <ImportSteps current={IMPORT_STEP_COUNT} />
        <ImportFinished listId={result.listId} listName={result.listName} counts={result} onImportAnother={reset} />
      </div>
    );
  }

  if (!csv) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {onImported ? null : <ImportSteps current={0} />}
        <CsvDropzone compact={Boolean(onImported)} onFile={(file) => void handleFile(file)} />
      </div>
    );
  }

  const listNameMissing = targetMode === "new" ? !newListName.trim() : !selectedListId;
  const mappedCount = Object.values(finalMapping).filter(Boolean).length;

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-6">
      {onImported ? null : <ImportSteps current={step} />}

      <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{fileName}</p>
          <p className="tabular text-xs text-subtle-foreground">
            {csv.rows.length.toLocaleString()} {csv.rows.length === 1 ? "row" : "rows"} · {csv.headers.length}{" "}
            {csv.headers.length === 1 ? "column" : "columns"}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={pending}>
          Choose another file
        </Button>
      </div>

      {step === 1 ? (
        <>
          <section aria-labelledby="csv-preview-heading" className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 id="csv-preview-heading" className="text-[15px] font-semibold tracking-[-0.01em]">
                Does this look right?
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                The first {Math.min(PREVIEW_ROWS, csv.rows.length)} of {csv.rows.length.toLocaleString()} rows. If the
                columns are jumbled, check the file&apos;s separator and encoding.
              </p>
            </div>
            <TableContainer className="min-w-0 max-w-full">
              <Table className="w-max min-w-full">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {csv.headers.map((h, i) => (
                      <TableHead key={`${h}-${i}`}>
                        <div className="max-w-44 truncate">{h.replace(/\uFEFF/g, "")}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csv.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <TableRow key={i}>
                      {csv.headers.map((h, hi) => (
                        <TableCell key={`${h}-${hi}`} className="py-2">
                          <div className="max-w-44 truncate">{r[h] || <span className="text-subtle-foreground">—</span>}</div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </section>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            <Button type="button" onClick={() => setStep(2)}>
              Continue <ArrowRight />
            </Button>
          </div>
        </>
      ) : (
        <>
          <TargetListPicker
            lists={lists}
            mode={targetMode}
            onModeChange={setTargetMode}
            newListName={newListName}
            onNewListName={setNewListName}
            selectedListId={selectedListId}
            onSelectList={setSelectedListId}
            disabled={pending}
          />

          <section aria-labelledby="column-mapping-heading" className="flex min-w-0 flex-col gap-3">
            <div>
              <h2 id="column-mapping-heading" className="text-[15px] font-semibold tracking-[-0.01em]">
                Match columns
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                We matched what we could. Custom variables can be used in templates, for example{" "}
                <code className="font-mono text-xs text-foreground">{"{{company_size}}"}</code>. Rows without a valid
                email are skipped.
              </p>
            </div>
            <ColumnMappingTable
              headers={csv.headers}
              sample={csv.rows[0]}
              mapping={mapping}
              customKeys={customKeys}
              disabled={pending}
              onMap={(col, v) => {
                setMapping((p) => ({ ...p, [col]: v }));
                if (v === CUSTOM && customKeys[col] === undefined) {
                  setCustomKeys((p) => ({ ...p, [col]: defaultCustomKey(col) }));
                }
              }}
              onCustomKey={(col, v) => setCustomKeys((p) => ({ ...p, [col]: v }))}
            />
          </section>

          <div
            data-testid="column-mapping-actions"
            className="sticky bottom-0 z-30 -mx-4 flex flex-col gap-3 border-t border-border bg-background px-4 py-3 sm:mx-0 sm:px-0"
          >
            {inlineProgress ? (
              <div className="flex flex-col gap-2" role="status" aria-live="polite">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="text-muted-foreground">Importing leads…</span>
                  <span className="tabular text-muted-foreground">
                    {inlineProgress.processed.toLocaleString()} of {inlineProgress.total.toLocaleString()} rows
                  </span>
                </div>
                <Progress value={inlineProgress.percent} aria-label="Import progress" />
              </div>
            ) : null}
            {!emailMapped ? (
              <p id="email-mapping-error" role="alert" className="text-[13px] text-destructive-text">
                {EMAIL_MAPPING_REQUIRED_MESSAGE}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={pending}>
                <ArrowLeft /> Back
              </Button>
              <div className="flex items-center gap-2">
                <span className="tabular hidden text-xs text-subtle-foreground sm:inline">
                  {mappedCount} of {csv.headers.length} columns imported
                </span>
                <Button type="button" variant="ghost" onClick={reset} disabled={pending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={doImport}
                  loading={pending}
                  disabled={!emailMapped || listNameMissing}
                  aria-describedby={!emailMapped ? "email-mapping-error" : undefined}
                >
                  Confirm and import
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

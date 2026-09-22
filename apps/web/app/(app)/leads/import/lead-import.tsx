"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CloudUpload, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { STANDARD_LEAD_FIELDS } from "@smartreach/shared";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@smartreach/ui";
import { guessField, parseCsvText, type ParsedCsv } from "@/lib/csv";
import { importLeads } from "@/lib/actions";

const IGNORE = "__ignore__";
const CUSTOM = "__custom__";

type Mapping = Record<string, string | null>; // csv column -> field key | null

function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  const used = new Set<string>();
  for (const h of headers) {
    const guess = guessField(h, STANDARD_LEAD_FIELDS as unknown as { key: string; label: string }[]);
    if (guess && !used.has(guess)) {
      m[h] = guess;
      used.add(guess);
    } else {
      // unmapped standard-ish -> custom variable by default, name = normalized header
      m[h] = null;
    }
  }
  return m;
}

export function LeadImport({
  lists,
  initialListId,
  onImported,
}: {
  lists: { id: string; name: string }[];
  /** Preselect a list, or "__new__" to create one during import. */
  initialListId?: string;
  /** Stay on the current screen and hand back the list (campaign wizard). */
  onImported?: (result: { listId: string; listName: string; imported: number }) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<1 | 2>(1);
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [mapping, setMapping] = useState<Mapping>({});
  const [customKeys, setCustomKeys] = useState<Record<string, string>>({});
  const [targetList, setTargetList] = useState<string>(() => {
    if (initialListId === "__new__") return "__new__";
    if (initialListId && lists.some((l) => l.id === initialListId)) return initialListId;
    return lists[0]?.id ?? "__new__";
  });
  const [newListName, setNewListName] = useState("");
  const [result, setResult] = useState<{ imported: number; skipped: number; invalid: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const emailMapped = useMemo(() => Object.values(mapping).includes("email"), [mapping]);

  const reset = () => {
    setCsv(null); setFileName(""); setMapping({}); setCustomKeys({}); setResult(null); setStep(1);
    if (lists[0]) setTargetList(lists[0].id);
  };

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseCsvText(text);
    if (parsed.rows.length === 0) {
      toast.error("That CSV looks empty");
      return;
    }
    setFileName(file.name);
    setCsv(parsed);
    setMapping(autoMap(parsed.headers));
    setNewListName(file.name.replace(/\.csv$/i, ""));
    setResult(null);
    setStep(1);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const finalMapping = useMemo(() => {
    // Build the mapping the server expects: csv column -> field key (custom vars use normalized name)
    const out: Record<string, string | null> = {};
    for (const col of csv?.headers ?? []) {
      const val = mapping[col];
      if (val === IGNORE || val === undefined) { out[col] = null; continue; }
      if (val === CUSTOM) {
        const key = (customKeys[col] ?? col).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
        out[col] = key || null;
      } else {
        out[col] = val;
      }
    }
    return out;
  }, [csv, mapping, customKeys]);

  const doImport = () =>
    start(async () => {
      if (!csv) return;
      const res = await importLeads({
        listId: targetList,
        listName: targetList === "__new__" ? newListName : undefined,
        mapping: finalMapping,
        rows: csv.rows,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.data && onImported) {
        const listName =
          targetList === "__new__"
            ? newListName.trim()
            : (lists.find((l) => l.id === res.data!.listId)?.name ??
              lists.find((l) => l.id === targetList)?.name ??
              "Lead list");
        onImported({ listId: res.data.listId, listName, imported: res.data.imported });
        return;
      }
      if (res.data) {
        setResult(res.data);
        toast.success("Import complete");
      }
    });

  /* ── Step 1: upload ── */
  if (!csv) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Upload leads CSV"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          onImported ? "p-8" : "p-20",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30",
        )}
      >
        <CloudUpload className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="font-medium">Drag & drop your leads CSV</p>
        <p className="mt-1 text-sm text-muted-foreground">
          UTF-8, any delimiter (comma, semicolon, tab). Up to 50,000 rows.
        </p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
      </div>
    );
  }

  /* ── Steps ── */
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => setStep(1)} className={cn("flex items-center gap-2", step === 1 ? "text-foreground" : "text-muted-foreground")}>
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", step === 1 ? "bg-primary text-primary-foreground" : "bg-success/20 text-success-foreground")}>1</span>
          Preview
        </button>
        <span className="h-px w-8 bg-border" />
        <span className={cn("flex items-center gap-2", step === 2 ? "text-foreground" : "text-muted-foreground")}>
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", step === 2 ? "bg-primary text-primary-foreground" : "bg-muted")}>2</span>
          Map columns
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-accent p-2"><Upload className="h-4 w-4" /></div>
          <div>
            <p className="font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">{csv.rows.length} rows · {csv.headers.length} columns</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><X className="h-4 w-4" /> Change file</Button>
      </div>

      {step === 1 && (
        <>
          <div className="overflow-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  {csv.headers.slice(0, 8).map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {csv.rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {csv.headers.slice(0, 8).map((h) => (
                      <td key={h} className="max-w-44 truncate px-3 py-2">{r[h]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setStep(2)}>Continue <ArrowRight className="h-4 w-4" /></Button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium">Import into</p>
                <Select value={targetList} onValueChange={setTargetList}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    <SelectItem value="__new__">+ Create new list…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {targetList === "__new__" && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">New list name</p>
                  <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="e.g. Q1 SaaS founders" />
                </div>
              )}
            </div>

            <div className="rounded-xl border">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
                <span>CSV column</span>
                <span className="w-6" />
                <span>SmartReach field / variable</span>
              </div>
              {csv.headers.map((col) => {
                const val = mapping[col] ?? CUSTOM;
                return (
                  <div key={col} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b px-4 py-2.5 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{col}</p>
                      <p className="truncate text-xs text-muted-foreground">{csv.rows[0]?.[col]}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <div className="flex items-center gap-2">
                      <Select
                        value={val === null || val === undefined ? CUSTOM : val}
                        onValueChange={(v) => setMapping((p) => ({ ...p, [col]: v === IGNORE ? IGNORE : v }))}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STANDARD_LEAD_FIELDS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}{f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value={CUSTOM}>Custom variable</SelectItem>
                          <SelectItem value={IGNORE}>— Ignore —</SelectItem>
                        </SelectContent>
                      </Select>
                      {val === CUSTOM && (
                        <Input
                          className="h-8 w-36 font-mono text-xs"
                          placeholder="{{field}}"
                          value={customKeys[col] ?? col.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}
                          onChange={(e) => setCustomKeys((p) => ({ ...p, [col]: e.target.value }))}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!emailMapped && (
              <p className="text-sm text-destructive">Map one column to <strong>Email</strong> to continue.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Custom variables become <code className="font-mono">{"{{var}}"}</code> in templates.
              Duplicates skipped, invalid emails removed automatically.
            </p>
          </div>

          {result && (
            <div className="flex flex-wrap gap-4 rounded-xl border bg-muted/30 p-4 text-sm">
              <span className="text-success-foreground font-medium">{result.imported} imported</span>
              <span className="text-amber-500">{result.skipped} duplicates skipped</span>
              <span className="text-destructive">{result.invalid} invalid emails</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
            <div className="flex gap-3">
              {result && !onImported ? (
                <Button onClick={() => router.push("/leads")}>View leads <ArrowRight className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={doImport} disabled={pending || !emailMapped || (targetList === "__new__" && !newListName.trim())}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Import {csv.rows.length} leads
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

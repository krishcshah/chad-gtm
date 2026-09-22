"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteImportJob,
  getActiveImportJob,
  saveImportJob,
  type StoredImportJob,
} from "@/lib/import-storage";
import { importLeads } from "@/lib/actions";

interface ImportJobContextType {
  activeJob: StoredImportJob | null;
  startImportJob: (params: {
    listName: string;
    fileName: string;
    mapping: Record<string, string | null>;
    rows: Record<string, string>[];
  }) => Promise<void>;
  dismissActiveJob: () => Promise<void>;
  cancelActiveJob: () => Promise<void>;
}

const ImportJobContext = createContext<ImportJobContextType | null>(null);

export function useImportJob() {
  return useContext(ImportJobContext);
}

const CHUNK_SIZE = 1000;

export function ImportJobProvider({ children }: { children: React.ReactNode }) {
  const [activeJob, setActiveJob] = useState<StoredImportJob | null>(null);
  const isProcessingRef = useRef(false);
  const shouldCancelRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  // Load existing active job from storage on initial mount
  useEffect(() => {
    let mounted = true;
    void getActiveImportJob().then((job) => {
      if (!mounted) return;
      if (job) {
        setActiveJob(job);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const processJob = useCallback(
    async (jobToProcess: StoredImportJob) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      shouldCancelRef.current = false;

      let currentJob = { ...jobToProcess };

      try {
        const total = currentJob.totalRows;

        while (currentJob.processedRows < total && currentJob.status === "running") {
          if (shouldCancelRef.current) {
            currentJob.status = "failed";
            currentJob.error = "Import cancelled by user";
            currentJob.updatedAt = Date.now();
            await saveImportJob(currentJob);
            setActiveJob({ ...currentJob });
            toast.info("Lead import was cancelled");
            break;
          }

          const startIndex = currentJob.processedRows;
          const chunk = currentJob.rows.slice(startIndex, startIndex + CHUNK_SIZE);
          const isFirstChunk = startIndex === 0;

          const res = await importLeads({
            listId: currentJob.listId,
            listName:
              isFirstChunk && currentJob.listId === "__new__"
                ? currentJob.listName.trim()
                : undefined,
            mapping: currentJob.mapping,
            rows: chunk,
          });

          if (!res.ok) {
            currentJob.status = "failed";
            currentJob.error = res.error || "Failed to import chunk";
            currentJob.updatedAt = Date.now();
            await saveImportJob(currentJob);
            setActiveJob({ ...currentJob });
            toast.error(res.error || "Import encountered an error");
            break;
          }

          if (res.data) {
            if (isFirstChunk && currentJob.listId === "__new__") {
              currentJob.listId = res.data.listId;
            }
            currentJob.imported += res.data.imported;
            currentJob.skipped += res.data.skipped;
            currentJob.invalid += res.data.invalid;
            currentJob.processedRows = Math.min(startIndex + chunk.length, total);
            currentJob.updatedAt = Date.now();

            await saveImportJob(currentJob);
            setActiveJob({ ...currentJob });
          }
        }

        if (currentJob.processedRows >= total && currentJob.status === "running") {
          currentJob.status = "completed";
          currentJob.updatedAt = Date.now();
          await saveImportJob(currentJob);
          setActiveJob({ ...currentJob });
          toast.success(
            `Import complete: ${currentJob.imported.toLocaleString()} leads imported into "${currentJob.listName}"`,
          );
          router.refresh();
        }
      } catch (err: unknown) {
        console.error("Error in background import process:", err);
        currentJob.status = "failed";
        currentJob.error = err instanceof Error ? err.message : "Unexpected import error";
        currentJob.updatedAt = Date.now();
        await saveImportJob(currentJob);
        setActiveJob({ ...currentJob });
        toast.error("Lead import encountered an error");
      } finally {
        isProcessingRef.current = false;
      }
    },
    [router],
  );

  // Resume running job whenever activeJob changes to running and not currently executing
  useEffect(() => {
    if (activeJob && activeJob.status === "running" && !isProcessingRef.current) {
      void processJob(activeJob);
    }
  }, [activeJob, processJob]);

  const startImportJob = useCallback(
    async ({
      listName,
      fileName,
      mapping,
      rows,
    }: {
      listName: string;
      fileName: string;
      mapping: Record<string, string | null>;
      rows: Record<string, string>[];
    }) => {
      const newJob: StoredImportJob = {
        id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        listName: listName.trim() || fileName.replace(/\.csv$/i, "") || "New Lead List",
        listId: "__new__",
        fileName,
        totalRows: rows.length,
        processedRows: 0,
        imported: 0,
        skipped: 0,
        invalid: 0,
        status: "running",
        error: null,
        mapping,
        rows,
        startedAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveImportJob(newJob);
      setActiveJob(newJob);
    },
    [],
  );

  const dismissActiveJob = useCallback(async () => {
    if (activeJob) {
      await deleteImportJob(activeJob.id);
      setActiveJob(null);
    }
  }, [activeJob]);

  const cancelActiveJob = useCallback(async () => {
    shouldCancelRef.current = true;
    if (activeJob && activeJob.status === "running") {
      const updated: StoredImportJob = {
        ...activeJob,
        status: "failed",
        error: "Import cancelled by user",
        updatedAt: Date.now(),
      };
      await saveImportJob(updated);
      setActiveJob(updated);
    }
  }, [activeJob]);

  const showFloatingWidget =
    activeJob &&
    activeJob.status === "running" &&
    pathname !== "/leads/import" &&
    !pathname.startsWith("/leads/import/");

  const percent = activeJob
    ? Math.round((activeJob.processedRows / (activeJob.totalRows || 1)) * 100)
    : 0;

  return (
    <ImportJobContext.Provider
      value={{
        activeJob,
        startImportJob,
        dismissActiveJob,
        cancelActiveJob,
      }}
    >
      {children}

      {/* Sleek Floating Background Import Progress Widget */}
      {showFloatingWidget && activeJob && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl border border-primary/30 bg-card/95 p-3.5 shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
          <div className="min-w-0 pr-1 max-w-[220px] sm:max-w-xs">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-foreground">
                {activeJob.listName}
              </span>
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary">
                {percent}%
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {activeJob.processedRows.toLocaleString()} / {activeJob.totalRows.toLocaleString()}
              </span>
            </div>
          </div>
          <Link
            href="/leads/import"
            className="shrink-0 rounded-lg border border-border bg-muted/80 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            View
          </Link>
        </div>
      )}
    </ImportJobContext.Provider>
  );
}

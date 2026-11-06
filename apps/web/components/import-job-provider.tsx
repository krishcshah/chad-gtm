"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, Progress } from "@smartreach/ui";
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
    listId?: string;
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
            toast.info("Import stopped");
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
            toast.error(res.error || "Import failed");
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
        toast.error("Import failed", { description: "Open the import page to see how far it got." });
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
      listId,
      listName,
      fileName,
      mapping,
      rows,
    }: {
      listId?: string;
      listName: string;
      fileName: string;
      mapping: Record<string, string | null>;
      rows: Record<string, string>[];
    }) => {
      const newJob: StoredImportJob = {
        id: `import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        listName: listName.trim() || fileName.replace(/\.csv$/i, "") || "New Lead List",
        listId: listId || "__new__",
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

      {showFloatingWidget && activeJob ? <ImportProgressDock job={activeJob} percent={percent} /> : null}
    </ImportJobContext.Provider>
  );
}

/** Small progress card pinned to the corner while an import runs on another page. */
function ImportProgressDock({ job, percent }: { job: StoredImportJob; percent: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-border bg-popover p-3.5 text-popover-foreground shadow-lg sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-80"
    >
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">Importing into {job.listName}</p>
          <p className="tabular text-xs text-subtle-foreground">
            {job.processedRows.toLocaleString()} of {job.totalRows.toLocaleString()} rows · {percent}%
          </p>
        </div>
        <Button variant="outline" size="xs" asChild>
          <Link href="/leads/import">View</Link>
        </Button>
      </div>
      <Progress value={percent} className="mt-3" aria-label="Import progress" />
    </div>
  );
}

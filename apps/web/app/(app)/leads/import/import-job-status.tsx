"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Progress,
} from "@smartreach/ui";
import type { StoredImportJob } from "@/lib/import-storage";

export interface ImportCountsValue {
  imported: number;
  skipped: number;
  invalid: number;
}

/** Imported / duplicate / invalid tallies, shown as one plain line of numbers. */
export function ImportCounts({ imported, skipped, invalid }: ImportCountsValue) {
  return (
    <ul className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border text-[13px]">
      <li className="flex flex-col gap-0.5 px-3 py-2.5 sm:px-4">
        <span>
          <span className="tabular text-base font-semibold text-foreground">{imported.toLocaleString()}</span> imported
        </span>
        <span className="text-xs text-subtle-foreground">New leads in the list</span>
      </li>
      <li className="flex flex-col gap-0.5 px-3 py-2.5 sm:px-4">
        <span>
          <span className="tabular text-base font-semibold text-foreground">{skipped.toLocaleString()}</span> duplicates
          skipped
        </span>
        <span className="text-xs text-subtle-foreground">Already in the list</span>
      </li>
      <li className="flex flex-col gap-0.5 px-3 py-2.5 sm:px-4">
        <span>
          <span className="tabular text-base font-semibold text-foreground">{invalid.toLocaleString()}</span> invalid
          emails
        </span>
        <span className="text-xs text-subtle-foreground">Not imported</span>
      </li>
    </ul>
  );
}

function listHref(listId: string) {
  return listId && listId !== "__new__" ? `/leads/${listId}` : "/campaigns";
}

export function ImportRunning({ job, onCancel }: { job: StoredImportJob; onCancel: () => Promise<void> }) {
  const percent = Math.round((job.processedRows / (job.totalRows || 1)) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          Importing leads
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{job.fileName}</span> into{" "}
          <span className="font-medium text-foreground">{job.listName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="tabular text-muted-foreground">
              {job.processedRows.toLocaleString()} of {job.totalRows.toLocaleString()} rows
            </span>
            <span className="tabular font-medium">{percent}%</span>
          </div>
          <Progress value={percent} aria-label="Import progress" />
        </div>
        <ImportCounts imported={job.imported} skipped={job.skipped} invalid={job.invalid} />
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          You can leave this page. The import keeps going while AutoGTM is open in this browser. If you close the tab, it
          picks up where it stopped the next time you open AutoGTM here.
        </p>
      </CardContent>
      <CardFooter className="justify-between">
        <ConfirmDialog
          title="Stop this import?"
          description="Leads imported so far stay in the list. The remaining rows are not imported."
          confirmLabel="Stop import"
          cancelLabel="Keep importing"
          destructive
          onConfirm={onCancel}
        >
          <Button variant="ghost" size="sm">
            Stop import
          </Button>
        </ConfirmDialog>
        <Button variant="outline" size="sm" asChild>
          <Link href="/campaigns">Back to campaigns</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ImportFinished({
  listId,
  listName,
  counts,
  onImportAnother,
}: {
  listId: string;
  listName: string;
  counts: ImportCountsValue;
  onImportAnother: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success-text" aria-hidden />
          Import complete
        </CardTitle>
        <CardDescription>
          {counts.imported === 0 ? (
            <>
              No new leads were added to <span className="font-medium text-foreground">{listName}</span>.
            </>
          ) : (
            <>
              {counts.imported.toLocaleString()} {counts.imported === 1 ? "lead is" : "leads are"} now in{" "}
              <span className="font-medium text-foreground">{listName}</span>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportCounts {...counts} />
      </CardContent>
      <CardFooter>
        <Button variant="outline" size="sm" onClick={onImportAnother}>
          Import another file
        </Button>
        <Button size="sm" asChild>
          <Link href={listHref(listId)}>
            Open list <ArrowRight />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ImportStopped({ job, onStartOver }: { job: StoredImportJob; onStartOver: () => void }) {
  const cancelled = job.error === "Import cancelled by user";
  const partial = job.imported > 0 && job.listId !== "__new__";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleSlash className="size-4 text-destructive-text" aria-hidden />
          {cancelled ? "Import stopped" : "Import failed"}
        </CardTitle>
        <CardDescription>
          {cancelled
            ? `You stopped the import after ${job.processedRows.toLocaleString()} of ${job.totalRows.toLocaleString()} rows.`
            : `${(job.error || "Something went wrong").replace(/[.\s]+$/, "")}. ${job.processedRows.toLocaleString()} of ${job.totalRows.toLocaleString()} rows were processed.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ImportCounts imported={job.imported} skipped={job.skipped} invalid={job.invalid} />
      </CardContent>
      <CardFooter>
        {partial ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={listHref(job.listId)}>Open {job.listName}</Link>
          </Button>
        ) : null}
        <Button size="sm" onClick={onStartOver}>
          Start a new import
        </Button>
      </CardFooter>
    </Card>
  );
}

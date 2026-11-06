"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { cn } from "@smartreach/ui";

/** Drag-and-drop or click-to-browse target for one CSV file. */
export function CsvDropzone({
  compact,
  onFile,
}: {
  compact?: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const open = () => inputRef.current?.click();

  return (
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
        if (file) onFile(file);
      }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Upload leads CSV"
      aria-describedby="csv-dropzone-hint"
      className={cn(
        "flex w-full min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring",
        compact ? "px-6 py-8" : "px-6 py-14 sm:py-20",
        dragOver ? "border-brand bg-brand-soft/50" : "border-border-strong bg-card hover:bg-muted/40",
      )}
    >
      <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground shadow-xs ring-1 ring-border">
        <FileUp className="size-5" aria-hidden />
      </span>
      <p className="text-[15px] font-semibold tracking-[-0.01em]">
        {dragOver ? "Drop to upload" : "Drop a CSV here, or click to choose one"}
      </p>
      <p id="csv-dropzone-hint" className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
        One row per contact with an email column. Comma, semicolon and tab separators all work. Up to 50,000 rows.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

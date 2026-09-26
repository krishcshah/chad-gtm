"use client";

import React, { useState, useRef } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Progress,
} from "@smartreach/ui";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { ingestCsvDirectoryAction } from "@/lib/actions";
import { toast } from "sonner";

interface CsvUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CsvUploadDialog({
  open,
  onOpenChange,
  onSuccess,
}: CsvUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (selected.name.endsWith(".csv")) {
        setFile(selected);
        setErrorMsg(null);
      } else {
        setErrorMsg("Please upload a .csv file");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.name.endsWith(".csv")) {
        setFile(selected);
        setErrorMsg(null);
      } else {
        setErrorMsg("Please upload a .csv file");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      setUploadProgress(25);
      setErrorMsg(null);

      const formData = new FormData();
      formData.append("file", file);

      setUploadProgress(50);
      const res = await ingestCsvDirectoryAction(formData);
      setUploadProgress(100);

      if (res.ok) {
        toast.success(
          `Ingested ${res.data?.inserted.toLocaleString()} leads! Total in directory: ${res.data?.totalInDb.toLocaleString()}`
        );
        setFile(null);
        onOpenChange(false);
        onSuccess();
      } else {
        setErrorMsg(res.error || "Failed to ingest CSV file");
        toast.error(res.error || "Ingestion failed");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "An unexpected error occurred");
      toast.error("Failed to process file");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <FileSpreadsheet className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">
                Ingest Leads CSV
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Expand your central prospect database with any new CSV dataset.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Universal Schema Note */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/90 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="size-3.5" />
              Universal Flexible Ingestion
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Our schema automatically indexes common columns (Name, Email, Phone, Company, Industry, Country, LinkedIn, etc.) and seamlessly stores all unique extra columns in dynamic metadata.
            </p>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              file
                ? "border-primary/50 bg-primary/5"
                : "border-border/80 hover:border-primary/50 hover:bg-muted/30"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
            />

            {file ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-card border border-border">
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="size-6 text-primary shrink-0" />
                  <div className="text-left min-w-0">
                    <p className="font-semibold text-xs text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 p-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                  }}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Upload className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Click to browse or drag and drop your CSV
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Supports files up to 500MB (LeadRocks, Apollo, ZoomInfo, or custom lists)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Ingesting and indexing records...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-1.5" />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="gap-1.5 font-semibold"
          >
            {isUploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Processing Ingestion...
              </>
            ) : (
              <>
                <Upload className="size-3.5" />
                Start Ingestion
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

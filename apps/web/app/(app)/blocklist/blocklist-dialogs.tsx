"use client";

import { useRef, useState, type FormEvent } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  SegmentedControl,
  Textarea,
} from "@smartreach/ui";
import { addSuppression, importSuppressions, removeSuppression } from "@/lib/actions";

export type BlocklistEntryKind = "email" | "domain";

export type BlocklistItem = {
  id: string;
  value: string;
  kind: string;
  reason: string;
  source: string;
  createdAt: string;
};

export function kindLabel(kind: string) {
  if (kind === "domain") return "Domain";
  if (kind === "email") return "Email";
  return kind || "Address";
}

export function sourceLabel(source: string) {
  switch (source) {
    case "manual":
      return "Added by you";
    case "import":
      return "Imported";
    case "unsubscribe":
      return "Unsubscribed";
    case "bounce":
      return "Bounced";
    case "complaint":
      return "Opted out";
    default:
      return source || "Unknown";
  }
}

export function importSummary(data: { added: number; skipped: number; invalid: number }) {
  const parts = [data.added === 1 ? "Added 1 address." : `Added ${data.added.toLocaleString()} addresses.`];
  if (data.skipped > 0) {
    parts.push(
      data.skipped === 1
        ? "1 was already on the blocklist."
        : `${data.skipped.toLocaleString()} were already on the blocklist.`,
    );
  }
  if (data.invalid > 0) {
    parts.push(
      data.invalid === 1
        ? "1 line was not a valid email or domain."
        : `${data.invalid.toLocaleString()} lines were not valid emails or domains.`,
    );
  }
  return parts.join(" ");
}

/* ─── Add one address ─────────────────────────────────────────────────── */

export function AddToBlocklistDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<BlocklistEntryKind>("email");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setKind("email");
    setValue("");
    setReason("");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof addSuppression>>;
    try {
      result = await addSuppression({ value, kind, reason });
    } catch {
      setError("The address could not be added. Check your connection and try again.");
      return;
    } finally {
      setBusy(false);
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(
      /already/i.test(result.message ?? "") ? "That address is already on the blocklist" : "Added to the blocklist",
    );
    reset();
    onOpenChange(false);
    await onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Add to blocklist</DialogTitle>
            <DialogDescription>Campaigns never send to a blocked email or to anyone at a blocked domain.</DialogDescription>
          </DialogHeader>

          <SegmentedControl<BlocklistEntryKind>
            aria-label="What to block"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "email", label: "One email" },
              { value: "domain", label: "Whole domain" },
            ]}
            className="self-start"
          />

          <Field
            label={kind === "domain" ? "Domain" : "Email"}
            required
            error={error}
            hint={
              kind === "domain"
                ? "Blocks every address at this domain, e.g. acme.com."
                : "Blocks only this exact address."
            }
          >
            <Input
              value={value}
              onChange={(e) => {
                const next = e.target.value;
                setValue(next);
                // "@acme.com" can only mean a domain.
                if (next.trim().startsWith("@")) setKind("domain");
                if (error) setError(null);
              }}
              placeholder={kind === "domain" ? "acme.com" : "name@company.com"}
              type={kind === "email" ? "email" : "text"}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className="font-mono text-[13px]"
            />
          </Field>

          <Field label="Reason" optional hint="Only you see this.">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Competitor, asked not to be contacted…"
              maxLength={500}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!value.trim()}>
              Add to blocklist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Import a list ───────────────────────────────────────────────────── */

const MAX_FILE_BYTES = 2_000_000;

function countEntries(text: string) {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function ImportBlocklistDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setText("");
    setFileName("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is larger than 2 MB. Split it into smaller lists.");
      return;
    }
    try {
      setText(await file.text());
      setFileName(file.name);
      setError(null);
    } catch {
      setError("That file could not be read. Paste the addresses instead.");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const body = text.trim();
    if (!body) {
      setError("Paste at least one email or domain, or choose a file.");
      return;
    }
    setBusy(true);
    setError(null);
    let result: Awaited<ReturnType<typeof importSuppressions>>;
    try {
      result = await importSuppressions({ text: body });
    } catch {
      setError("The list could not be imported. Check your connection and try again.");
      return;
    } finally {
      setBusy(false);
    }
    if (!result.ok || !result.data) {
      setError(result.ok ? "The import did not return a result. Try again." : result.error);
      return;
    }
    toast.success(importSummary(result.data));
    reset();
    onOpenChange(false);
    await onImported();
  }

  const entries = countEntries(text);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Import a blocklist</DialogTitle>
            <DialogDescription>
              One email, domain or @domain per line, or separated by commas. Up to 10,000 entries. Duplicates and
              invalid lines are skipped.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Addresses"
            error={error}
            action={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.csv,text/plain,text/csv"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                  }}
                />
                <Button type="button" variant="ghost" size="xs" onClick={() => fileRef.current?.click()}>
                  <FileUp /> {fileName ? "Choose another file" : "Choose a file"}
                </Button>
              </>
            }
            hint={fileName ? `Loaded from ${fileName}. You can edit it before importing.` : "TXT or CSV, up to 2 MB."}
          >
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              rows={8}
              placeholder={"ada@company.com\n@competitor.com\nvendor.io"}
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={entries === 0}>
              {entries > 0 ? `Import ${entries.toLocaleString()} ${entries === 1 ? "entry" : "entries"}` : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Remove one address ──────────────────────────────────────────────── */

export function RemoveFromBlocklistDialog({
  target,
  onClose,
  onRemoved,
}: {
  target: BlocklistItem | { id: string; value: string } | null;
  onClose: () => void;
  onRemoved: (id: string) => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={target ? `Unblock ${target.value}?` : "Unblock address?"}
      description="Campaigns will be able to send to it again. You can block it again at any time."
      confirmLabel="Unblock"
      destructive
      onConfirm={async () => {
        if (!target) return;
        const result = await removeSuppression(target.id);
        if (!result.ok) {
          toast.error(result.error || "The address could not be unblocked.");
          return;
        }
        toast.success(`Unblocked ${target.value}`);
        await onRemoved(target.id);
      }}
    />
  );
}

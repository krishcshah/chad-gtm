"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Progress, statusVariant, cn } from "@smartreach/ui";
import { toggleSender } from "@/lib/actions";

export interface SenderCardData {
  id: string;
  senderName: string;
  email: string;
  status: string;
  health: number;
  smtpStatus: string;
  imapStatus: string;
  dailyLimit: number;
  usedToday: number;
}

const healthColor = (h: number) =>
  h >= 80 ? "text-success-foreground" : h >= 50 ? "text-warning-foreground" : "text-destructive";

function isPermissionError(message: string) {
  return /permission|forbidden|unauthorized|access denied/i.test(message);
}

function isNextRedirect(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const digest = "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return digest.startsWith("NEXT_REDIRECT");
}

export function SenderCard({ sender: s }: { sender: SenderCardData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(s.status);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const pct = s.dailyLimit > 0 ? Math.min(100, (s.usedToday / s.dailyLimit) * 100) : 0;
  const paused = status === "paused";

  useEffect(() => {
    setStatus(s.status);
  }, [s.status]);

  const toggle = () => {
    setError(null);
    setDenied(false);
    start(async () => {
      try {
        const res = await toggleSender(s.id, !paused);
        if (!res.ok) {
          if (isPermissionError(res.error)) setDenied(true);
          else setError(res.error);
          return;
        }
        const next = paused ? "active" : "paused";
        setStatus(next);
        toast.success(res.message ?? (paused ? "Sender resumed" : "Sender paused"));
        router.refresh();
      } catch (caught) {
        if (isNextRedirect(caught)) throw caught;
        const message = caught instanceof Error ? caught.message : "Could not update this sender";
        if (isPermissionError(message)) setDenied(true);
        else setError(message);
      }
    });
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground shadow-sm" aria-busy={pending}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{s.senderName}</h3>
          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
        </div>
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Daily usage</span>
          <span>
            {s.usedToday}/{s.dailyLimit}
          </span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className={cn("font-medium", healthColor(s.health))}>◍ {s.health}</span>
          <span className="text-muted-foreground">
            SMTP {s.smtpStatus === "ok" ? "✓" : "·"} · IMAP {s.imapStatus === "ok" ? "✓" : "·"}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          aria-label={paused ? `Resume ${s.email}` : `Pause ${s.email}`}
          onClick={toggle}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? (paused ? "Resuming…" : "Pausing…") : paused ? "Resume" : "Pause"}
        </Button>
      </div>

      {denied ? (
        <p role="alert" className="text-xs text-destructive">
          You do not have permission to change this sender.{" "}
          <a href="/login" className="underline underline-offset-2">
            Sign in
          </a>
        </p>
      ) : error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

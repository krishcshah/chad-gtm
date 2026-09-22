"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Flame, Loader2, Settings2, Sliders } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Progress, statusVariant, cn } from "@smartreach/ui";
import { toggleSender } from "@/lib/actions";
import { parseSenderWarmup } from "@/lib/sender-warmup";
import { SenderDetailDrawer, type SenderFullData } from "./sender-detail-drawer";

export interface SenderCardData {
  id: string;
  senderName: string;
  email: string;
  status: string;
  health: number;
  smtpStatus: string;
  imapStatus: string;
  dailyLimit: number;
  hourlyLimit?: number;
  usedToday: number;
  repliedCount?: number;
  signature?: string;
  fromName?: string;
  replyTo?: string;
  timezone?: string;
}

const healthColor = (h: number) =>
  h >= 80 ? "text-emerald-400" : h >= 50 ? "text-amber-400" : "text-destructive";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { warmup } = useMemo(() => parseSenderWarmup(s.signature), [s.signature]);
  const pct = s.dailyLimit > 0 ? Math.min(100, (s.usedToday / s.dailyLimit) * 100) : 0;
  const paused = status === "paused";

  useEffect(() => {
    setStatus(s.status);
  }, [s.status]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDrawerOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDrawerOpen(true);
          }
        }}
        className={cn(
          "group relative space-y-4 rounded-2xl border border-border/60 bg-card/60 p-5 text-card-foreground shadow-sm transition-all backdrop-blur",
          "hover:bg-accent/40 hover:border-border hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-busy={pending}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-sm group-hover:text-primary transition-colors">
              {s.senderName}
            </h3>
            <p className="truncate text-xs text-muted-foreground mt-0.5">{s.email}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {warmup.enabled && (
              <span className="flex items-center text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
                <Flame className="size-3 mr-0.5" /> Warmup
              </span>
            )}
            <Badge variant={statusVariant(status)} className="capitalize text-[10px]">
              {status}
            </Badge>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Daily sending quota</span>
            <span className="font-semibold text-foreground tabular-nums">
              {s.usedToday} / {s.dailyLimit}
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-border/40">
          <div className="flex items-center gap-3">
            <span className={cn("font-bold flex items-center gap-1", healthColor(s.health))}>
              <span className="size-2 rounded-full bg-current" /> {s.health}
            </span>
            <span className="text-[11px] text-muted-foreground">
              SMTP {s.smtpStatus === "ok" ? "✓" : "·"} · IMAP {s.imapStatus === "ok" ? "✓" : "·"}
            </span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDrawerOpen(true)}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Sliders className="size-3.5 mr-1" /> Performance
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              aria-label={paused ? `Resume ${s.email}` : `Pause ${s.email}`}
              onClick={toggle}
              className="h-8 text-xs font-semibold"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending ? (paused ? "Resuming…" : "Pausing…") : paused ? "Resume" : "Pause"}
            </Button>
          </div>
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

      <SenderDetailDrawer
        sender={s as SenderFullData}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}

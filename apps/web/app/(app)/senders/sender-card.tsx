"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, Loader2, Settings2, Sliders } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Progress, statusVariant, cn } from "@smartreach/ui";
import { toggleSender, updateSenderDetails } from "@/lib/actions";
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
  smtpHost?: string;
  smtpPort?: number;
  smtpUsername?: string;
  smtpSecurity?: "tls" | "ssl" | "none";
  imapHost?: string;
  imapPort?: number;
  imapUsername?: string;
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

export function SenderCard({
  sender: s,
  selectable = false,
  selected = false,
  onSelect,
}: {
  sender: SenderCardData;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(s.status);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { warmup } = useMemo(() => parseSenderWarmup(s.signature), [s.signature]);
  const [warmupEnabled, setWarmupEnabled] = useState(warmup.enabled);
  const [warmupPending, startWarmupTransition] = useTransition();

  const pct = s.dailyLimit > 0 ? Math.min(100, (s.usedToday / s.dailyLimit) * 100) : 0;
  const paused = status === "paused";

  useEffect(() => {
    setStatus(s.status);
  }, [s.status]);

  useEffect(() => {
    setWarmupEnabled(warmup.enabled);
  }, [warmup.enabled]);

  const toggleWarmup = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !warmupEnabled;
    setWarmupEnabled(next);
    startWarmupTransition(async () => {
      const res = await updateSenderDetails(s.id, {
        warmup: { enabled: next },
      });
      if (!res.ok) {
        setWarmupEnabled(!next);
        toast.error(res.error || "Failed to update warmup");
      } else {
        toast.success(
          next
            ? `Warmup enabled for ${s.senderName}`
            : `Warmup disabled for ${s.senderName}`,
        );
        router.refresh();
      }
    });
  };

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

  const handleCardClick = () => {
    if (selectable && onSelect) {
      onSelect();
    } else {
      setDrawerOpen(true);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleCardClick();
          }
        }}
        className={cn(
          "group relative space-y-4 rounded-2xl border p-5 text-card-foreground shadow-sm transition-all backdrop-blur",
          selected
            ? "border-primary bg-primary/[0.04] ring-2 ring-primary/20 shadow-md"
            : "border-border/60 bg-card/60 hover:bg-accent/40 hover:border-border hover:shadow-md",
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-busy={pending}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectable && (
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md border transition-all",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/80 bg-background",
                )}
              >
                {selected && <Check className="size-3.5 stroke-[3]" />}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-sm group-hover:text-primary transition-colors">
                {s.senderName}
              </h3>
              <p className="truncate text-xs text-muted-foreground mt-0.5">{s.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {warmupEnabled && (
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

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-border/40">
          <div className="flex items-center gap-3">
            <span className={cn("font-bold flex items-center gap-1", healthColor(s.health))}>
              <span className="size-2 rounded-full bg-current" /> {s.health}
            </span>
            <span className="text-[11px] text-muted-foreground">
              SMTP {s.smtpStatus === "ok" ? "✓" : "·"} · IMAP {s.imapStatus === "ok" ? "✓" : "·"}
            </span>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* Small Warmup Toggle directly on the bottom right of the card */}
            <button
              type="button"
              role="switch"
              aria-checked={warmupEnabled}
              onClick={toggleWarmup}
              disabled={warmupPending}
              title={
                warmupEnabled
                  ? "Warmup active — click to turn off"
                  : "Warmup off — click to turn on"
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium transition-all border shrink-0",
                warmupEnabled
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Flame
                className={cn(
                  "size-3",
                  warmupEnabled
                    ? "text-amber-400 fill-amber-400/20 animate-pulse"
                    : "text-muted-foreground",
                )}
              />
              <span className="text-[10px] hidden sm:inline">Warmup</span>
              <span
                className={cn(
                  "relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer rounded-full border-1 border-transparent transition-colors duration-200 ease-in-out",
                  warmupEnabled ? "bg-amber-500" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block size-2.5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-[1px]",
                    warmupEnabled ? "translate-x-3" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDrawerOpen(true)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
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

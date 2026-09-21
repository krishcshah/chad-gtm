"use client";

import { useTransition } from "react";
import { Badge, Button, Progress, cn } from "@smartreach/ui";
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

export function SenderCard({ sender: s }: { sender: SenderCardData }) {
  const [pending, start] = useTransition();
  const pct = s.dailyLimit > 0 ? Math.min(100, (s.usedToday / s.dailyLimit) * 100) : 0;
  const paused = s.status === "paused";

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium truncate">{s.senderName}</h3>
          <p className="text-xs text-muted-foreground truncate">{s.email}</p>
        </div>
        <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
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

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className={cn("font-medium", healthColor(s.health))}>◍ {s.health}</span>
          <span className="text-muted-foreground">
            SMTP {s.smtpStatus === "ok" ? "✓" : "·"} · IMAP {s.imapStatus === "ok" ? "✓" : "·"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await toggleSender(s.id, !paused);
            })
          }
        >
          {paused ? "Resume" : "Pause"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Flame,
  Globe,
  Loader2,
  Mail,
  Play,
  Save,
  ShieldCheck,
  Sliders,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Progress,
  Switch,
  Textarea,
  cn,
} from "@smartreach/ui";
import {
  deleteSender,
  runWarmupCycle,
  testSenderConnection,
  updateSenderDetails,
  updateSenderLimits,
} from "@/lib/actions";
import { parseSenderWarmup, type SenderWarmupConfig } from "@/lib/sender-warmup";

export interface SenderFullData {
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

interface SenderDetailDrawerProps {
  sender: SenderFullData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SenderDetailDrawer({ sender, open, onOpenChange }: SenderDetailDrawerProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"performance" | "limits" | "warmup" | "settings">("performance");
  const [pending, start] = useTransition();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Parsed Warmup & Signature
  const { warmup: initialWarmup, cleanSig: initialSig } = useMemo(
    () => parseSenderWarmup(sender.signature),
    [sender.signature],
  );

  // Editable Limits Form
  const [dailyLimit, setDailyLimit] = useState(sender.dailyLimit || 50);
  const [hourlyLimit, setHourlyLimit] = useState(sender.hourlyLimit || 15);

  // Editable Warmup Form
  const [warmupEnabled, setWarmupEnabled] = useState(initialWarmup.enabled);
  const [warmupDaily, setWarmupDaily] = useState(initialWarmup.dailyLimit || 20);
  const [warmupRate, setWarmupRate] = useState(initialWarmup.replyRate || 40);

  // Editable General Settings Form
  const [senderName, setSenderName] = useState(sender.senderName || "");
  const [fromName, setFromName] = useState(sender.fromName || sender.senderName || "");
  const [replyTo, setReplyTo] = useState(sender.replyTo || "");
  const [signatureText, setSignatureText] = useState(initialSig);

  // Connection Test State
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSaveLimits = () => {
    start(async () => {
      const res = await updateSenderLimits(sender.id, dailyLimit, hourlyLimit);
      if (res.ok) {
        toast.success(res.message || "Limits updated");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update limits");
      }
    });
  };

  const handleSaveWarmup = () => {
    start(async () => {
      const res = await updateSenderDetails(sender.id, {
        cleanSignature: signatureText,
        warmup: {
          enabled: warmupEnabled,
          dailyLimit: warmupDaily,
          replyRate: warmupRate,
          sentCount: initialWarmup.sentCount,
          receivedCount: initialWarmup.receivedCount,
        },
      });
      if (res.ok) {
        toast.success("Warm-up settings saved");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to save warmup");
      }
    });
  };

  const handleSaveSettings = () => {
    start(async () => {
      const res = await updateSenderDetails(sender.id, {
        senderName,
        fromName,
        replyTo,
        cleanSignature: signatureText,
        dailyLimit,
        hourlyLimit,
        warmup: {
          enabled: warmupEnabled,
          dailyLimit: warmupDaily,
          replyRate: warmupRate,
          sentCount: initialWarmup.sentCount,
          receivedCount: initialWarmup.receivedCount,
        },
      });
      if (res.ok) {
        toast.success("Sender details saved");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to save details");
      }
    });
  };

  const handleRunWarmup = () => {
    start(async () => {
      const res = await runWarmupCycle();
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDelete = () => {
    start(async () => {
      const res = await deleteSender(sender.id);
      if (res.ok) {
        toast.success("Sender deleted");
        setDeleteModalOpen(false);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error || "Could not delete sender");
      }
    });
  };

  const pct = dailyLimit > 0 ? Math.min(100, Math.round((sender.usedToday / dailyLimit) * 100)) : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)] p-0 overflow-hidden border-border/70 bg-card/95 backdrop-blur-2xl">
          {/* Header Bar */}
          <div className="border-b border-border/50 p-5 bg-card/60">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Mail className="size-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-foreground truncate">{sender.senderName}</h2>
                    <p className="text-xs text-muted-foreground truncate">{sender.email}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={sender.status === "active" ? "success" : "secondary"}
                  className="capitalize font-semibold text-[11px]"
                >
                  {sender.status}
                </Badge>
                {warmupEnabled && (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10 text-[10px]">
                    <Flame className="size-3 mr-1" /> Warmup Active
                  </Badge>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="mt-5 flex items-center gap-1 border-b border-border/40 pb-1">
              {[
                { key: "performance", label: "Health & Performance", icon: Activity },
                { key: "limits", label: "Usage Limits", icon: Sliders },
                { key: "warmup", label: "Warmup Pool", icon: Flame },
                { key: "settings", label: "Settings", icon: Save },
              ].map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key as any)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all",
                      active
                        ? "bg-primary/15 text-primary font-semibold shadow-2xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 max-h-[520px] overflow-y-auto space-y-5">
            {/* TAB 1: HEALTH & PERFORMANCE */}
            {tab === "performance" && (
              <div className="space-y-5">
                {/* Health Score Banner */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-border/60 bg-accent/20 p-4">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Reputation Score
                    </span>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-foreground tabular-nums">
                        {sender.health || 98}
                      </span>
                      <span className="text-xs text-muted-foreground">/ 100</span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="size-3" /> Optimal deliverability
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-accent/20 p-4">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Daily Usage
                    </span>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-foreground tabular-nums">
                        {sender.usedToday}
                      </span>
                      <span className="text-xs text-muted-foreground">/ {dailyLimit} sent</span>
                    </div>
                    <Progress value={pct} className="h-1.5 mt-2" />
                  </div>

                  <div className="rounded-xl border border-border/60 bg-accent/20 p-4">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Unique Replies
                    </span>
                    <div className="mt-2 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold text-foreground tabular-nums">
                        {sender.repliedCount || 0}
                      </span>
                      <span className="text-xs text-muted-foreground">leads</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">Recorded inbound replies</p>
                  </div>
                </div>

                {/* Simulated 14-Day Delivery Trajectory Chart */}
                <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      14-Day Delivery Trajectory
                    </h3>
                    <span className="text-[11px] text-muted-foreground">Average 99.4% Delivery</span>
                  </div>

                  <div className="h-28 flex items-end gap-1.5 pt-4 pb-1">
                    {[12, 18, 25, 22, 34, 40, 38, 45, 42, 48, 50, 46, 49, 50].map((val, idx) => {
                      const barPct = Math.round((val / 50) * 100);
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative">
                          <div
                            className="w-full rounded-t-sm bg-primary/70 transition-all group-hover:bg-primary group-hover:scale-y-105"
                            style={{ height: `${barPct}%` }}
                          />
                          <span className="text-[9px] text-muted-foreground tabular-nums opacity-60">
                            {idx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* DNS & Protocols Status */}
                <div className="rounded-xl border border-border/60 bg-card/40 p-4 space-y-3">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Protocol & Auth Diagnostics
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg border border-border/40 bg-accent/20 flex flex-col gap-1">
                      <span className="text-muted-foreground text-[10px]">SMTP Status</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> {sender.smtpStatus === "failed" ? "Failed" : "Connected"}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-border/40 bg-accent/20 flex flex-col gap-1">
                      <span className="text-muted-foreground text-[10px]">IMAP Sync</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> {sender.imapStatus === "failed" ? "Failed" : "Synchronized"}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-border/40 bg-accent/20 flex flex-col gap-1">
                      <span className="text-muted-foreground text-[10px]">SPF Record</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> Pass
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg border border-border/40 bg-accent/20 flex flex-col gap-1">
                      <span className="text-muted-foreground text-[10px]">DKIM / DMARC</span>
                      <span className="font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3" /> 100% Valid
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: USAGE LIMITS (EDITABLE) */}
            {tab === "limits" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-4">
                  <div>
                    <Label htmlFor="daily-limit" className="text-xs font-semibold">
                      Max Emails Per Day
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                      The campaign engine halts outreach from this mailbox once this quota is reached.
                    </p>
                    <div className="flex items-center gap-3">
                      <Input
                        id="daily-limit"
                        type="number"
                        min={1}
                        max={1000}
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(Number(e.target.value))}
                        className="w-28 font-mono text-sm"
                      />
                      <input
                        type="range"
                        min={1}
                        max={200}
                        value={dailyLimit}
                        onChange={(e) => setDailyLimit(Number(e.target.value))}
                        className="flex-1 accent-primary"
                      />
                      <span className="text-xs font-bold tabular-nums w-12 text-right">
                        {dailyLimit}/day
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-border/40">
                    <Label htmlFor="hourly-limit" className="text-xs font-semibold">
                      Max Emails Per Hour
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                      Pacing safeguard to prevent sudden high-burst sending.
                    </p>
                    <Input
                      id="hourly-limit"
                      type="number"
                      min={1}
                      max={100}
                      value={hourlyLimit}
                      onChange={(e) => setHourlyLimit(Number(e.target.value))}
                      className="w-28 font-mono text-sm"
                    />
                  </div>

                  <Button onClick={handleSaveLimits} disabled={pending} size="sm" className="gap-1.5 mt-2">
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Save Limits
                  </Button>
                </div>
              </div>
            )}

            {/* TAB 3: WARMUP POOL */}
            {tab === "warmup" && (
              <div className="space-y-5">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                  <Flame className="size-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-semibold text-foreground">Peer-to-Peer Warm-up Network</p>
                    <p className="text-muted-foreground mt-0.5">
                      Enrolled mailboxes automatically exchange simulated warm-up emails with other sender
                      accounts in your pool. They reply based on your target rate, building reputation
                      before you launch massive campaigns.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <Label className="text-xs font-semibold">Enroll in Warmup Pool</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Enable automated peer warm-up exchanges for this mailbox.
                      </p>
                    </div>
                    <Switch checked={warmupEnabled} onCheckedChange={setWarmupEnabled} />
                  </div>

                  {warmupEnabled && (
                    <div className="space-y-4 pt-3 border-t border-border/40">
                      <div>
                        <Label className="text-xs font-semibold">Daily Warm-up Volume</Label>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          Max warm-up emails sent per day (gradually ramps up).
                        </p>
                        <Input
                          type="number"
                          min={5}
                          max={100}
                          value={warmupDaily}
                          onChange={(e) => setWarmupDaily(Number(e.target.value))}
                          className="w-32 font-mono text-sm"
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-semibold">Target Reply Rate ({warmupRate}%)</Label>
                        <p className="text-[11px] text-muted-foreground mb-2">
                          Percentage of peer emails that will automatically generate positive replies.
                        </p>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={10}
                            max={90}
                            step={5}
                            value={warmupRate}
                            onChange={(e) => setWarmupRate(Number(e.target.value))}
                            className="flex-1 accent-amber-500"
                          />
                          <span className="text-xs font-bold tabular-nums w-12 text-right">
                            {warmupRate}%
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-3 rounded-lg border border-border/40 bg-accent/20">
                          <span className="text-[10px] text-muted-foreground uppercase">Warmup Sent</span>
                          <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                            {initialWarmup.sentCount}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg border border-border/40 bg-accent/20">
                          <span className="text-[10px] text-muted-foreground uppercase">Warmup Received</span>
                          <p className="text-lg font-bold tabular-nums text-foreground mt-0.5">
                            {initialWarmup.receivedCount}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button onClick={handleSaveWarmup} disabled={pending} size="sm" className="gap-1.5">
                          <Save className="size-3.5" /> Save Warm-up Config
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRunWarmup}
                          disabled={pending}
                          className="gap-1.5 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          <Play className="size-3.5" /> Run Exchange Cycle Now
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: SETTINGS & DETAILS */}
            {tab === "settings" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-card/40 p-5 space-y-4">
                  <div>
                    <Label htmlFor="sender-name" className="text-xs font-semibold">
                      Account Label
                    </Label>
                    <Input
                      id="sender-name"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="e.g. Founder Outreach"
                      className="mt-1"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="from-name" className="text-xs font-semibold">
                        From Name
                      </Label>
                      <Input
                        id="from-name"
                        value={fromName}
                        onChange={(e) => setFromName(e.target.value)}
                        placeholder="Krish Shah"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="reply-to" className="text-xs font-semibold">
                        Reply-To (Optional)
                      </Label>
                      <Input
                        id="reply-to"
                        type="email"
                        value={replyTo}
                        onChange={(e) => setReplyTo(e.target.value)}
                        placeholder="inbox@krishshah.work"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="signature" className="text-xs font-semibold">
                      Default Signature
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-1">
                      Appended when your email templates use &#123;&#123;signature&#125;&#125;.
                    </p>
                    <Textarea
                      id="signature"
                      rows={3}
                      value={signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      placeholder={"—\nKrish Shah\nFounder, SmartReach"}
                    />
                  </div>

                  <Button onClick={handleSaveSettings} disabled={pending} size="sm" className="gap-1.5 mt-2">
                    {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                    Save Account Settings
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Footer Actions */}
          <div className="border-t border-border/50 p-4 bg-card/60 flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteModalOpen(true)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <Trash2 className="size-3.5" /> Delete Sender
            </Button>

            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle>Delete sender account</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove &ldquo;{sender.email}&rdquo;? This will immediately remove it
              from all running campaigns and stop sender rotation for this mailbox.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteModalOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Delete Mailbox
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

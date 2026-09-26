"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, KeyRound, Loader2, Mail, Server, Shield, Sliders } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@smartreach/ui";
import { bulkUpdateSenders } from "@/lib/actions";

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: () => void;
}

export function BulkEditDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: BulkEditDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Warmup & Status
  const [warmupAction, setWarmupAction] = useState<"keep" | "enable" | "disable">("keep");
  const [warmupReplyRate, setWarmupReplyRate] = useState<string>("");
  const [warmupDailyTarget, setWarmupDailyTarget] = useState<string>("");
  const [statusAction, setStatusAction] = useState<"keep" | "active" | "paused">("keep");
  const [dailyLimit, setDailyLimit] = useState<string>("");
  const [hourlyLimit, setHourlyLimit] = useState<string>("");

  // SMTP & IMAP Credentials
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpSecurity, setSmtpSecurity] = useState<"keep" | "tls" | "ssl" | "none">("keep");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("");
  const [imapPassword, setImapPassword] = useState("");

  // Profile
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [timezone, setTimezone] = useState("");

  const resetForm = () => {
    setWarmupAction("keep");
    setWarmupReplyRate("");
    setWarmupDailyTarget("");
    setStatusAction("keep");
    setDailyLimit("");
    setHourlyLimit("");
    setSmtpHost("");
    setSmtpPort("");
    setSmtpPassword("");
    setSmtpSecurity("keep");
    setImapHost("");
    setImapPort("");
    setImapPassword("");
    setFromName("");
    setReplyTo("");
    setTimezone("");
  };

  const handleApply = () => {
    if (selectedIds.length === 0) return;

    startTransition(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {};

      if (warmupAction === "enable") updates.warmupEnabled = true;
      if (warmupAction === "disable") updates.warmupEnabled = false;
      if (warmupReplyRate.trim() && !isNaN(Number(warmupReplyRate))) {
        updates.warmupReplyRate = Math.min(100, Math.max(0, Number(warmupReplyRate)));
      }
      if (warmupDailyTarget.trim() && !isNaN(Number(warmupDailyTarget))) {
        updates.warmupDailyTarget = Math.max(1, Number(warmupDailyTarget));
      }

      if (statusAction === "active") updates.status = "active";
      if (statusAction === "paused") updates.status = "paused";

      if (dailyLimit.trim() && !isNaN(Number(dailyLimit))) {
        updates.dailyLimit = Math.max(1, Number(dailyLimit));
      }
      if (hourlyLimit.trim() && !isNaN(Number(hourlyLimit))) {
        updates.hourlyLimit = Math.max(1, Number(hourlyLimit));
      }

      if (smtpHost.trim()) updates.smtpHost = smtpHost.trim();
      if (smtpPort.trim() && !isNaN(Number(smtpPort))) updates.smtpPort = Number(smtpPort);
      if (smtpPassword.trim()) updates.smtpPassword = smtpPassword.trim();
      if (smtpSecurity !== "keep") updates.smtpSecurity = smtpSecurity;

      if (imapHost.trim()) updates.imapHost = imapHost.trim();
      if (imapPort.trim() && !isNaN(Number(imapPort))) updates.imapPort = Number(imapPort);
      if (imapPassword.trim()) updates.imapPassword = imapPassword.trim();

      if (fromName.trim()) updates.fromName = fromName.trim();
      if (replyTo.trim()) updates.replyTo = replyTo.trim();
      if (timezone.trim()) updates.timezone = timezone.trim();

      if (Object.keys(updates).length === 0) {
        toast.info("No field values were changed");
        onOpenChange(false);
        return;
      }

      const res = await bulkUpdateSenders(selectedIds, updates);
      if (!res.ok) {
        toast.error(res.error || "Failed to bulk update senders");
      } else {
        toast.success(res.message ?? `Updated ${selectedIds.length} senders successfully`);
        resetForm();
        onOpenChange(false);
        onSuccess();
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sliders className="size-5 text-primary" />
            Bulk Edit {selectedIds.length} Sender{selectedIds.length === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fields left blank or unchanged will retain their existing mailbox configurations. Only specified fields will be applied across all {selectedIds.length} selected accounts.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="warmup" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-3 rounded-xl border border-border/80 bg-muted/60 p-1 sm:p-1.5 gap-1 sm:gap-1.5 shadow-2xs">
            <TabsTrigger
              value="warmup"
              className="gap-1.5 sm:gap-2 rounded-lg py-2 sm:py-2.5 text-[11px] sm:text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-background/40 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
            >
              <Flame className="size-3.5 text-amber-500" />
              <span className="truncate">Warmup & Limits</span>
            </TabsTrigger>
            <TabsTrigger
              value="servers"
              className="gap-1.5 sm:gap-2 rounded-lg py-2 sm:py-2.5 text-[11px] sm:text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-background/40 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
            >
              <Server className="size-3.5 text-blue-500" />
              <span className="truncate">SMTP & IMAP</span>
            </TabsTrigger>
            <TabsTrigger
              value="profile"
              className="gap-1.5 sm:gap-2 rounded-lg py-2 sm:py-2.5 text-[11px] sm:text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-background/40 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border"
            >
              <Mail className="size-3.5 text-violet-500" />
              <span className="truncate">Profile & Pacing</span>
            </TabsTrigger>
          </TabsList>

          {/* Flexible container that adapts cleanly on mobile */}
          <div className="min-h-0 sm:min-h-[340px] pt-3 flex flex-col justify-start">
            {/* TAB 1: Warmup & Limits */}
            <TabsContent value="warmup" className="space-y-4 m-0">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <Label className="text-xs font-semibold text-foreground">Peer Warmup Pool</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Enroll senders to exchange simulated outreach messages with peers.
                  </p>
                </div>
                <Select value={warmupAction} onValueChange={(v: any) => setWarmupAction(v)}>
                  <SelectTrigger className="h-8 w-full sm:w-44 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep Current</SelectItem>
                    <SelectItem value="enable">Enable on All</SelectItem>
                    <SelectItem value="disable">Disable on All</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {warmupAction === "enable" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-amber-500/15">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Reply Rate (%)</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 30"
                      value={warmupReplyRate}
                      onChange={(e) => setWarmupReplyRate(e.target.value)}
                      className="h-8 text-xs bg-background"
                      min={0}
                      max={100}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Daily Warmup Cap</Label>
                    <Input
                      type="number"
                      placeholder="e.g. 25"
                      value={warmupDailyTarget}
                      onChange={(e) => setWarmupDailyTarget(e.target.value)}
                      className="h-8 text-xs bg-background"
                      min={1}
                      max={200}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Account Status</Label>
                <Select value={statusAction} onValueChange={(v: any) => setStatusAction(v)}>
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep Current</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Daily Limit (emails/day)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 40"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="h-8 text-xs bg-background"
                  min={1}
                  max={2000}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Hourly Limit</Label>
                <Input
                  type="number"
                  placeholder="e.g. 10"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                  className="h-8 text-xs bg-background"
                  min={1}
                  max={500}
                />
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: SMTP & IMAP */}
          <TabsContent value="servers" className="space-y-4 m-0">
            <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-3.5 sm:p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Server className="size-3.5 text-primary" /> SMTP Outbound Host & Security
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">SMTP Server Host</Label>
                  <Input
                    placeholder="e.g. smtp.gmail.com"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div className="space-y-1 col-span-1">
                  <Label className="text-[11px] text-muted-foreground">Port</Label>
                  <Input
                    type="number"
                    placeholder="587"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">SMTP Password / App Password</Label>
                  <Input
                    type="password"
                    placeholder="Update credentials across selected…"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Security Mode</Label>
                  <Select value={smtpSecurity} onValueChange={(v: any) => setSmtpSecurity(v)}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep Current</SelectItem>
                      <SelectItem value="tls">STARTTLS (Port 587)</SelectItem>
                      <SelectItem value="ssl">SSL / TLS (Port 465)</SelectItem>
                      <SelectItem value="none">None (Port 25)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-3.5 sm:p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Shield className="size-3.5 text-primary" /> IMAP Inbound Sync (UniBox)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-1 sm:col-span-2">
                  <Label className="text-[11px] text-muted-foreground">IMAP Server Host</Label>
                  <Input
                    placeholder="e.g. imap.gmail.com"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
                <div className="space-y-1 col-span-1">
                  <Label className="text-[11px] text-muted-foreground">Port</Label>
                  <Input
                    type="number"
                    placeholder="993"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">IMAP Password</Label>
                <Input
                  type="password"
                  placeholder="Leave blank to keep current…"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: Profile & Pacing */}
          <TabsContent value="profile" className="space-y-4 m-0">
            <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-3.5 sm:p-4">
              <div className="space-y-1">
                <Label className="text-xs">Display Sender Name</Label>
                <Input
                  placeholder="e.g. Alex at Acme"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
                <p className="text-[11px] text-muted-foreground">
                  The visible human name prospects see next to your mailbox address.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Reply-To Address</Label>
                <Input
                  type="email"
                  placeholder="e.g. replies@acme.com"
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
                <p className="text-[11px] text-muted-foreground">
                  Route prospect replies to an alternate inbox if specified.
                </p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Timezone</Label>
                <Input
                  placeholder="e.g. America/New_York or UTC"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            </div>
          </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4 flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button size="sm" onClick={handleApply} disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Check className="size-3.5 mr-1.5" />}
            {pending ? "Applying changes…" : `Apply to ${selectedIds.length} Senders`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

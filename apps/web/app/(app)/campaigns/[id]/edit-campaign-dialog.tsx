"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Layers, Mail, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Switch,
  cn,
} from "@smartreach/ui";
import { updateCampaignSettings } from "@/lib/actions";

interface SenderOption {
  id: string;
  senderName: string;
  email: string;
  status: string;
}

interface CampaignData {
  id: string;
  name: string;
  dailyLimit: number | null;
  sendingWindowStart: string | null;
  sendingWindowEnd: string | null;
  sendingTimezone: string | null;
  businessDaysOnly: boolean | null;
  stopOnReply: boolean | null;
  trackOpens?: boolean | null;
  minDelaySec: number | null;
  maxDelaySec: number | null;
  senders: { id: string; email: string; senderName?: string }[];
}

export function EditCampaignDialog({
  campaign,
  availableSenders,
  onGoToSequence,
}: {
  campaign: CampaignData;
  availableSenders: SenderOption[];
  onGoToSequence?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(campaign.name);
  const [dailyLimit, setDailyLimit] = useState(String(campaign.dailyLimit ?? 500));
  const [sendingWindowStart, setSendingWindowStart] = useState(campaign.sendingWindowStart || "09:00");
  const [sendingWindowEnd, setSendingWindowEnd] = useState(campaign.sendingWindowEnd || "17:00");
  const [sendingTimezone, setSendingTimezone] = useState(campaign.sendingTimezone || "UTC");
  const [businessDaysOnly, setBusinessDaysOnly] = useState(campaign.businessDaysOnly ?? true);
  const [stopOnReply, setStopOnReply] = useState(campaign.stopOnReply ?? true);
  const [trackOpens, setTrackOpens] = useState(campaign.trackOpens ?? true);
  const [minDelaySec, setMinDelaySec] = useState(String(campaign.minDelaySec ?? 120));
  const [maxDelaySec, setMaxDelaySec] = useState(String(campaign.maxDelaySec ?? 300));
  const [selectedSenderIds, setSelectedSenderIds] = useState<string[]>(
    campaign.senders.map((s) => s.id)
  );

  const toggleSender = (senderId: string) => {
    setSelectedSenderIds((prev) =>
      prev.includes(senderId) ? prev.filter((id) => id !== senderId) : [...prev, senderId]
    );
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Campaign name cannot be empty");
      return;
    }
    if (selectedSenderIds.length === 0) {
      toast.error("Select at least one sending mailbox");
      return;
    }

    startTransition(async () => {
      const res = await updateCampaignSettings(campaign.id, {
        name: name.trim(),
        dailyLimit: parseInt(dailyLimit, 10) || 500,
        sendingWindowStart,
        sendingWindowEnd,
        sendingTimezone: sendingTimezone.trim() || "UTC",
        businessDaysOnly,
        stopOnReply,
        trackOpens,
        minDelaySec: parseInt(minDelaySec, 10) || 120,
        maxDelaySec: parseInt(maxDelaySec, 10) || 300,
        senderIds: selectedSenderIds,
      });

      if (res.ok) {
        toast.success(res.message ?? "Campaign settings updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 shadow-2xs">
          <Settings2 className="size-3.5 text-muted-foreground" />
          Edit Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Edit Campaign</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Adjust sending pace, active schedules, mailbox rotation, and sequences. Changes will apply to all subsequent queued emails.
          </DialogDescription>
        </DialogHeader>

        {/* Sequence Banner Shortcut */}
        <div className="flex items-center justify-between rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="size-4" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Edit Sequence Steps & A/B Copy</p>
              <p className="text-[11px] text-muted-foreground">
                Update subject lines, email templates, delays, and split test variants.
              </p>
            </div>
          </div>
          {onGoToSequence && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setOpen(false);
                onGoToSequence();
              }}
              className="text-xs shrink-0"
            >
              Open Sequence &rarr;
            </Button>
          )}
        </div>

        <div className="space-y-4 pt-2">
          {/* Campaign Name */}
          <div className="space-y-1.5">
            <Label htmlFor="camp-name" className="text-xs font-medium">Campaign Name</Label>
            <Input
              id="camp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Q4 Enterprise Outreach"
              className="text-xs"
            />
          </div>

          {/* Sending Schedule & Pace */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-3">
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Sending Schedule & Limits
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="daily-limit" className="text-[11px] text-muted-foreground">Daily Send Limit (across all senders)</Label>
                <Input
                  id="daily-limit"
                  type="number"
                  min={1}
                  max={50000}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="timezone" className="text-[11px] text-muted-foreground">Timezone</Label>
                <Input
                  id="timezone"
                  value={sendingTimezone}
                  onChange={(e) => setSendingTimezone(e.target.value)}
                  placeholder="e.g. America/New_York or UTC"
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="win-start" className="text-[11px] text-muted-foreground">Sending Window Start</Label>
                <Input
                  id="win-start"
                  type="time"
                  value={sendingWindowStart}
                  onChange={(e) => setSendingWindowStart(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="win-end" className="text-[11px] text-muted-foreground">Sending Window End</Label>
                <Input
                  id="win-end"
                  type="time"
                  value={sendingWindowEnd}
                  onChange={(e) => setSendingWindowEnd(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/50">
              <div className="space-y-1">
                <Label htmlFor="min-delay" className="text-[11px] text-muted-foreground">Min Jitter Delay (seconds)</Label>
                <Input
                  id="min-delay"
                  type="number"
                  min={10}
                  max={1200}
                  value={minDelaySec}
                  onChange={(e) => setMinDelaySec(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="max-delay" className="text-[11px] text-muted-foreground">Max Jitter Delay (seconds)</Label>
                <Input
                  id="max-delay"
                  type="number"
                  min={20}
                  max={3600}
                  value={maxDelaySec}
                  onChange={(e) => setMaxDelaySec(e.target.value)}
                  className="text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="b-days" className="text-xs font-medium cursor-pointer">Weekdays Only (Mon–Fri)</Label>
                  <p className="text-[11px] text-muted-foreground">Pause outreach automatically on weekends</p>
                </div>
                <Switch
                  id="b-days"
                  checked={businessDaysOnly}
                  onCheckedChange={setBusinessDaysOnly}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="stop-reply" className="text-xs font-medium cursor-pointer">Stop on Reply</Label>
                  <p className="text-[11px] text-muted-foreground">Freeze subsequent steps as soon as a lead responds</p>
                </div>
                <Switch
                  id="stop-reply"
                  checked={stopOnReply}
                  onCheckedChange={setStopOnReply}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="track-opens" className="text-xs font-medium cursor-pointer">Track Email Opens</Label>
                  <p className="text-[11px] text-muted-foreground">Embed a 1x1 tracking pixel to record email open events</p>
                </div>
                <Switch
                  id="track-opens"
                  checked={trackOpens}
                  onCheckedChange={setTrackOpens}
                />
              </div>
            </div>
          </div>

          {/* Connected Mailboxes (Senders) */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Rotated Mailboxes ({selectedSenderIds.length} active)
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Select inboxes to distribute sending
              </span>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {availableSenders.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No sender accounts configured.</p>
              ) : (
                availableSenders.map((s) => {
                  const selected = selectedSenderIds.includes(s.id);
                  return (
                    <div
                      key={s.id}
                      onClick={() => toggleSender(s.id)}
                      className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors",
                        selected
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Mail className={cn("size-3.5", selected ? "text-primary" : "text-muted-foreground")} />
                        <span className="font-medium text-foreground">{s.senderName || s.email}</span>
                        <span className="text-[11px] text-muted-foreground">&lt;{s.email}&gt;</span>
                      </div>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}>
                        {selected ? "Active" : "Excluded"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-border/50">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={pending}
            className="shadow-sm"
          >
            {pending ? "Saving Changes…" : "Save Campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

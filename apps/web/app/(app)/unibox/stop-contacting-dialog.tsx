"use client";

import { useEffect, useId, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@smartreach/ui";

/**
 * Confirm "Not interested": the tag marks the lead Lost, and (checked by
 * default) also stops every campaign and the agent, and blocklists them.
 */
export function StopContactingDialog({
  target,
  pending,
  onCancel,
  onConfirm,
}: {
  target: { name: string; email: string } | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (stopContacting: boolean) => void;
}) {
  const checkboxId = useId();
  const [stop, setStop] = useState(true);
  useEffect(() => {
    if (target) setStop(true);
  }, [target]);

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Mark ${target?.name ?? "this lead"} as not interested?`}</DialogTitle>
          <DialogDescription>The lead is marked Lost.</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-2.5">
          <Checkbox id={checkboxId} checked={stop} onCheckedChange={(v) => setStop(v === true)} className="mt-0.5" />
          <Label htmlFor={checkboxId} className="font-normal leading-snug text-muted-foreground">
            {`Also stop contacting ${target?.email ?? "them"}: no more emails from any of your campaigns, and the agent won't reply. They're added to your blocklist.`}
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(stop)} disabled={pending}>
            Mark not interested
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

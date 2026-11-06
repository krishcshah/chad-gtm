"use client";

import { useRef } from "react";
import {
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  statusVariant,
} from "@smartreach/ui";
import { ConnectionTab } from "./detail/connection-tab";
import { OverviewTab } from "./detail/overview-tab";
import { SettingsTab } from "./detail/settings-tab";
import { connectionSummary, type SenderRow } from "./sender-types";

// Inactive tabs stay mounted (hidden) so unsaved edits survive a tab switch.
const tabPanel = "mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden";

/** Side sheet for one mailbox: overview and connection test, settings, server login. */
export function SenderDetailDrawer({
  sender,
  open,
  onOpenChange,
}: {
  sender: SenderRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Keep showing the last mailbox while the sheet animates closed.
  const last = useRef<SenderRow | null>(sender);
  if (sender) last.current = sender;
  const s = sender ?? last.current;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {s ? <SenderSheetBody key={s.id} sender={s} onClose={() => onOpenChange(false)} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SenderSheetBody({ sender, onClose }: { sender: SenderRow; onClose: () => void }) {
  const conn = connectionSummary(sender);
  return (
    <>
      <SheetHeader>
        <SheetTitle className="truncate">{sender.senderName || sender.email}</SheetTitle>
        <SheetDescription className="truncate">{sender.email}</SheetDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(sender.status)} dot className="capitalize">
            {sender.status}
          </Badge>
          <Badge variant={conn.variant}>{conn.label}</Badge>
        </div>
      </SheetHeader>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="shrink-0 px-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="connection">Server login</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" forceMount className={tabPanel}>
          <OverviewTab sender={sender} onDeleted={onClose} />
        </TabsContent>
        <TabsContent value="settings" forceMount className={tabPanel}>
          <SettingsTab sender={sender} />
        </TabsContent>
        <TabsContent value="connection" forceMount className={tabPanel}>
          <ConnectionTab sender={sender} />
        </TabsContent>
      </Tabs>
    </>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { timeAgo } from "@smartreach/shared";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  ConfirmDialog,
  DataList,
  Progress,
  SectionHeader,
  SheetBody,
  SheetFooter,
  statusVariant,
  toast,
} from "@smartreach/ui";
import { retestSenderConnection } from "@/lib/actions";
import { WARMUP_STATUS_DESCRIPTION, WARMUP_STATUS_TITLE } from "@/lib/sender-warmup";
import { ConnectionResult } from "../connection-result";
import { connectionSummary, protocolLabel, type ConnectionCheck, type SenderRow } from "../sender-types";
import { useSenderActions } from "../use-sender-actions";

type Live = Pick<SenderRow, "status" | "health" | "smtpStatus" | "imapStatus">;

export function OverviewTab({ sender, onDeleted }: { sender: SenderRow; onDeleted: () => void }) {
  const router = useRouter();
  const { toggle, remove, togglingId } = useSenderActions();
  const [testing, setTesting] = useState(false);
  const [check, setCheck] = useState<ConnectionCheck | null>(null);
  // Fresh values from the last test, shown until the refreshed page data arrives.
  const [live, setLive] = useState<(Live & { from: Live }) | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const propsLive: Live = {
    status: sender.status,
    health: sender.health,
    smtpStatus: sender.smtpStatus,
    imapStatus: sender.imapStatus,
  };
  const stale =
    live &&
    (live.from.status !== propsLive.status ||
      live.from.health !== propsLive.health ||
      live.from.smtpStatus !== propsLive.smtpStatus ||
      live.from.imapStatus !== propsLive.imapStatus);
  const s = { ...sender, ...(live && !stale ? live : {}) };

  const conn = connectionSummary(s);
  const smtp = protocolLabel(s.smtpStatus);
  const imap = protocolLabel(s.imapStatus, Boolean(s.imapHost));
  const tested = s.smtpStatus !== "untested";
  const pct = s.dailyLimit > 0 ? Math.min(100, Math.round((s.usedToday / s.dailyLimit) * 100)) : 0;
  const paused = s.status === "paused";

  const retest = async () => {
    setTesting(true);
    setCheck(null);
    try {
      const res = await retestSenderConnection(sender.id);
      if (!res.ok) {
        toast.error(res.error || "The connection test failed");
        return;
      }
      if (res.data) {
        const { smtp: smtpRes, imap: imapRes, ...rest } = res.data;
        setCheck({ smtp: smtpRes, imap: imapRes });
        setLive({ ...rest, from: propsLive });
        router.refresh();
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not run the connection test");
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SheetBody className="flex flex-col gap-8">
        <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 [&>*]:bg-card">
          <div className="flex flex-col gap-2 p-4">
            <dt className="text-[13px] text-muted-foreground">Sent today</dt>
            <dd className="flex flex-col gap-2">
              <span className="tabular text-[22px] font-semibold leading-none tracking-[-0.02em]">
                {s.usedToday.toLocaleString()}
                <span className="text-sm font-normal text-subtle-foreground"> / {s.dailyLimit.toLocaleString()}</span>
              </span>
              <Progress value={pct} aria-label={`${pct}% of today's limit used`} />
            </dd>
          </div>
          <div className="flex flex-col gap-2 p-4">
            <dt className="text-[13px] text-muted-foreground">Replies</dt>
            <dd className="flex flex-col gap-1">
              <span className="tabular text-[22px] font-semibold leading-none tracking-[-0.02em]">
                {s.repliedCount.toLocaleString()}
              </span>
              <span className="text-xs text-subtle-foreground">Received by this mailbox</span>
            </dd>
          </div>
          <div className="flex flex-col gap-2 p-4">
            <dt className="text-[13px] text-muted-foreground">Health</dt>
            <dd className="flex flex-col gap-1">
              <span className="tabular text-[22px] font-semibold leading-none tracking-[-0.02em]">
                {tested ? (
                  <>
                    {s.health}
                    <span className="text-sm font-normal text-subtle-foreground"> / 100</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-xs text-subtle-foreground">
                {tested ? "Set by the last connection test" : "Not tested yet"}
              </span>
            </dd>
          </div>
        </dl>

        <section className="flex flex-col gap-3">
          <SectionHeader
            title="Connection"
            description={conn.detail}
            actions={
              <Button variant="outline" size="sm" loading={testing} onClick={() => void retest()}>
                {testing ? null : <RefreshCw />}
                {testing ? "Testing…" : "Test connection"}
              </Button>
            }
          />
          <DataList
            items={[
              {
                label: "Status",
                value: (
                  <Badge variant={statusVariant(s.status)} dot className="capitalize">
                    {s.status}
                  </Badge>
                ),
              },
              {
                label: "Sending (SMTP)",
                value: (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={smtp.variant}>{smtp.label}</Badge>
                    <span className="truncate text-muted-foreground">
                      {s.smtpHost}:{s.smtpPort}
                    </span>
                  </span>
                ),
              },
              {
                label: "Reply detection (IMAP)",
                value: (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={imap.variant}>{imap.label}</Badge>
                    {s.imapHost ? (
                      <span className="truncate text-muted-foreground">
                        {s.imapHost}:{s.imapPort}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                label: "Replies last checked",
                value: s.lastSyncAt ? timeAgo(s.lastSyncAt) : <span className="text-muted-foreground">Never</span>,
              },
            ]}
          />
          {check && <ConnectionResult result={check} imapConfigured={Boolean(s.imapHost)} />}
        </section>

        <Alert>
          <AlertTitle>{WARMUP_STATUS_TITLE}</AlertTitle>
          <AlertDescription>{WARMUP_STATUS_DESCRIPTION}</AlertDescription>
        </Alert>
      </SheetBody>

      <SheetFooter className="justify-between">
        <Button variant="destructive-outline" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 />
          Delete
        </Button>
        <Button variant="outline" size="sm" loading={togglingId === sender.id} onClick={() => void toggle(s)}>
          {togglingId === sender.id ? null : paused ? <Play /> : <Pause />}
          {paused ? "Resume sending" : "Pause sending"}
        </Button>
      </SheetFooter>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive
        title={`Delete ${sender.email}?`}
        description="Campaigns stop sending from this mailbox straight away. Emails already sent and replies already received are kept."
        confirmLabel="Delete mailbox"
        onConfirm={async () => {
          if (await remove(sender)) onDeleted();
        }}
      />
    </>
  );
}

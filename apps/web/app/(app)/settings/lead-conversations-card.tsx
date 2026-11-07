"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from "@smartreach/ui";
import {
  copyProfileFromRunAction,
  handWaitingToAgentAction,
  previewModeChangeAction,
  saveLeadConversationSettingsAction,
  type LeadConversationSettingsView,
} from "@/lib/lead-conversation-actions";
import {
  LEAD_CONVERSATIONS_LABEL,
  MODE_DESCRIPTION,
  MODE_LABEL,
  PAUSE_AGENT_EVERYWHERE_HINT,
  PAUSE_AGENT_EVERYWHERE_LABEL,
  agentUnavailableNote,
  openDraftsNote,
  type LeadConversationMode,
} from "@/lib/lead-conversations";
import { HandOverDialog } from "@/components/lead-conversations/lead-conversations-control";
import { BookingLinkSuggestion } from "./booking-link-suggestion";
import { countKnowledgeAction } from "@/lib/autopilot-actions";
import { saveNotificationSettingsAction, type NotificationSettingsView } from "@/lib/workspace-profile-actions";
import { NotificationSettings, notificationsDirty, type NotificationDraft } from "./notification-settings";

const MODES: LeadConversationMode[] = ["agent", "approve", "manual"];

/** Mirrors the engine's grounding check, for the form as typed. */
function missingFor(form: { companySummary: string; mainOffer: string; bookingUrl: string }) {
  const missing: Array<"business profile" | "main offer" | "booking link"> = [];
  if (!form.companySummary.trim()) missing.push("business profile");
  if (!form.mainOffer.trim()) missing.push("main offer");
  if (!form.bookingUrl.trim()) missing.push("booking link");
  return missing;
}

/** Settings › Lead conversations: the workspace default and what the agent needs to talk for you. */
export function LeadConversationsCard({
  initial,
  knowledgeCount: initialKnowledgeCount,
  notifications,
  latestRunBookingUrl = null,
}: {
  initial: LeadConversationSettingsView;
  /** Own link of the workspace's newest Autopilot run, offered while the default is empty. */
  latestRunBookingUrl?: string | null;
  /** Settings › Lead conversations › Notifications (loaded by the page). */
  notifications?: { settings: NotificationSettingsView; loginEmail: string; mailerConfigured: boolean };
  /** Knowledge base items the agent may use in this workspace (fetched when not passed). */
  knowledgeCount?: number;
}) {
  const router = useRouter();
  const id = useId();
  const [knowledgeCount, setKnowledgeCount] = useState<number | null>(initialKnowledgeCount ?? null);
  useEffect(() => {
    if (initialKnowledgeCount !== undefined) return;
    let cancelled = false;
    countKnowledgeAction()
      .then((n) => {
        if (!cancelled) setKnowledgeCount(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialKnowledgeCount]);
  const [saved, setSaved] = useState(initial.settings);
  const [mode, setMode] = useState<LeadConversationMode>(initial.settings.defaultMode);
  const [paused, setPaused] = useState(initial.settings.agentPaused);
  const [bookingUrl, setBookingUrl] = useState(initial.settings.bookingUrl ?? "");
  const [companySummary, setCompanySummary] = useState(initial.settings.companySummary);
  const [mainOffer, setMainOffer] = useState(initial.settings.mainOffer);
  const [fillRun, setFillRun] = useState("");
  const [pending, start] = useTransition();
  const [filling, startFill] = useTransition();
  const [confirmWaiting, setConfirmWaiting] = useState(0);
  /** After turning the agent back on: conversations waiting that it could answer. */
  const [unpausedWaiting, setUnpausedWaiting] = useState(0);
  const [draftsNote, setDraftsNote] = useState(0);
  const notifyInitial: NotificationDraft | null = notifications
    ? {
        notifyEmail: notifications.settings.notifyEmail,
        notifyEscalations: notifications.settings.notifyEscalations,
        notifyReminders: notifications.settings.notifyReminders,
      }
    : null;
  const [notifySaved, setNotifySaved] = useState(notifyInitial);
  const [notify, setNotify] = useState(notifyInitial);

  /** Saves the Notifications section when it changed; false (with a toast) when that failed. */
  const saveNotifications = async () => {
    if (!notify || !notifySaved || !notificationsDirty(notify, notifySaved)) return true;
    const workspaceId = initial.settings.workspaceId;
    if (!workspaceId) {
      toast.error("Create a workspace first, then save the notification settings.");
      return false;
    }
    const res = await saveNotificationSettingsAction({ workspaceId, ...notify });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (res.data) {
      const next = {
        notifyEmail: res.data.notifyEmail,
        notifyEscalations: res.data.notifyEscalations,
        notifyReminders: res.data.notifyReminders,
      };
      setNotifySaved(next);
      setNotify(next);
    }
    return true;
  };

  const missing = missingFor({ companySummary, mainOffer, bookingUrl });
  const agentBlocked = missing.length > 0;
  const agentOnBefore = !saved.agentPaused && saved.defaultMode !== "manual";
  const agentOnAfter = !paused && mode !== "manual";

  const persist = (applyToWaiting: boolean) =>
    start(async () => {
      const res = await saveLeadConversationSettingsAction({
        defaultMode: mode,
        agentPaused: paused,
        bookingUrl,
        companySummary,
        mainOffer,
        applyToWaiting,
      });
      setConfirmWaiting(0);
      if (!res.ok) return void toast.error(res.error);
      if (res.data) {
        setSaved(res.data.settings);
        setBookingUrl(res.data.settings.bookingUrl ?? "");
        // Turned back on: ask before handing the backlog to the agent (never automatic).
        if (!applyToWaiting && res.data.waiting > 0) setUnpausedWaiting(res.data.waiting);
      }
      toast.success(res.message || "Saved");
      router.refresh();
    });

  const handOverAfterUnpause = (apply: boolean) => {
    if (!apply) return void setUnpausedWaiting(0);
    start(async () => {
      const res = await handWaitingToAgentAction({ workspace: true });
      setUnpausedWaiting(0);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Handed to the agent");
      router.refresh();
    });
  };

  const submit = () => {
    setDraftsNote(0);
    start(async () => {
      // One button saves the whole card: notifications first, so a bad address stops the save before anything else.
      const notifyChanged = !!notify && !!notifySaved && notificationsDirty(notify, notifySaved);
      if (!(await saveNotifications())) return;
      const modeChanged = mode !== saved.defaultMode || paused !== saved.agentPaused;
      if (!modeChanged) return persist(false);
      // Turning the pause off: the save itself reports what is waiting, then we ask.
      if (saved.agentPaused && !paused) return persist(false);
      // Changes apply going forward; ask before handing waiting conversations over.
      const preview = await previewModeChangeAction({ workspace: true }).catch(() => null);
      const counts = preview && preview.ok && preview.data ? preview.data : { waiting: 0, openDrafts: 0 };
      if (agentOnAfter && counts.waiting > 0) {
        // The rest waits on the dialog; say the notifications are already saved.
        if (notifyChanged) toast.success("Notification settings saved.");
        setConfirmWaiting(counts.waiting);
        return;
      }
      if (agentOnBefore && !agentOnAfter && counts.openDrafts > 0) setDraftsNote(counts.openDrafts);
      persist(false);
    });
  };

  const fillFromRun = (runId: string) => {
    setFillRun(runId);
    startFill(async () => {
      const res = await copyProfileFromRunAction(runId);
      if (!res.ok || !res.data) return void toast.error(res.ok ? "Nothing to copy from that run." : res.error);
      if (res.data.summary) setCompanySummary(res.data.summary);
      if (res.data.offer) setMainOffer(res.data.offer);
      if (res.data.bookingUrl && !bookingUrl.trim()) setBookingUrl(res.data.bookingUrl);
      toast.success("Filled from the run's research. Check it, then save.");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{LEAD_CONVERSATIONS_LABEL}</CardTitle>
        <CardDescription>
          Who answers your leads, and what the agent needs to answer for you. New campaigns start from this default.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field label="Default for new campaigns" hint={MODE_DESCRIPTION[mode]}>
          <Select value={mode} onValueChange={(v) => setMode(v as LeadConversationMode)}>
            <SelectTrigger aria-label="Default for new campaigns">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m} value={m} disabled={m === "agent" && agentBlocked && saved.defaultMode !== "agent"}>
                  {MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {agentBlocked ? (
          <p className="-mt-3 text-xs leading-relaxed text-muted-foreground">
            {agentUnavailableNote(missing).replace(" in Settings › Lead conversations", " below")}
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <label htmlFor={`${id}-pause`} className="text-[13px] font-medium">
              {PAUSE_AGENT_EVERYWHERE_LABEL}
            </label>
            <p id={`${id}-pause-hint`} className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {PAUSE_AGENT_EVERYWHERE_HINT}
            </p>
          </div>
          <Switch
            id={`${id}-pause`}
            checked={paused}
            onCheckedChange={setPaused}
            aria-describedby={`${id}-pause-hint`}
          />
        </div>

        <Field
          label="Booking link"
          hint="Where interested leads book a call. Autopilot runs without their own link use this one."
        >
          <Input
            type="url"
            inputMode="url"
            value={bookingUrl}
            onChange={(e) => setBookingUrl(e.target.value)}
            placeholder="https://cal.com/you/intro"
          />
        </Field>
        {!bookingUrl.trim() && latestRunBookingUrl ? (
          <BookingLinkSuggestion url={latestRunBookingUrl} onUse={setBookingUrl} />
        ) : null}

        <div className="flex flex-col gap-4 border-t border-border pt-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-medium">Business profile</p>
              <p className="mt-0.5 text-xs text-muted-foreground">What the agent may say about you. It never invents anything else.</p>
            </div>
            {initial.runs.length > 0 ? (
              <Select value={fillRun} onValueChange={fillFromRun} disabled={filling}>
                <SelectTrigger className="h-8 w-auto min-w-[12rem] text-[13px]" aria-label="Fill from an Autopilot run">
                  <SelectValue placeholder="Fill from an Autopilot run" />
                </SelectTrigger>
                <SelectContent align="end">
                  {initial.runs.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <Field label="Company summary" hint="Two or three sentences: what you do and for whom.">
            <Textarea
              value={companySummary}
              onChange={(e) => setCompanySummary(e.target.value)}
              rows={3}
              maxLength={1000}
              className="text-[13px]"
              placeholder="Acme automates month-end reporting for finance teams at mid-size companies."
            />
          </Field>
          <Field label="Main offer" hint="What you want leads to say yes to.">
            <Textarea
              value={mainOffer}
              onChange={(e) => setMainOffer(e.target.value)}
              rows={2}
              maxLength={500}
              className="text-[13px]"
              placeholder="A free 30-minute reporting audit."
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-5 text-[13px]">
          <Link
            href="/requests#knowledge"
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:bg-muted/50"
          >
            <span>
              Knowledge base
              {knowledgeCount !== null ? (
                <span className="tabular text-muted-foreground">
                  : {knowledgeCount.toLocaleString()} {knowledgeCount === 1 ? "item" : "items"}
                </span>
              ) : null}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              Open knowledge base
              <ArrowUpRight className="size-4" aria-hidden />
            </span>
          </Link>
          {notifications ? null : (
            <p className="text-xs text-muted-foreground">
              Needs you emails go to <span className="font-medium text-foreground">{initial.notifyTo}</span>.
            </p>
          )}
        </div>

        {notifications && notify ? (
          <NotificationSettings
            loginEmail={notifications.loginEmail}
            value={notify}
            onChange={setNotify}
            mailerConfigured={notifications.mailerConfigured}
          />
        ) : null}

        {draftsNote > 0 ? <Alert variant="info">{openDraftsNote(draftsNote)}</Alert> : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={submit} loading={pending}>
          Save changes
        </Button>
      </CardFooter>

      <HandOverDialog
        open={confirmWaiting > 0}
        waiting={confirmWaiting}
        pending={pending}
        onChoose={persist}
        onCancel={() => setConfirmWaiting(0)}
      />
      <HandOverDialog
        open={unpausedWaiting > 0}
        waiting={unpausedWaiting}
        pending={pending}
        description="These replies arrived while the agent was paused. It answers them after the same checks as any reply. Nothing is sent right now, and conversations someone already answered are left alone."
        onChoose={handOverAfterUnpause}
        onCancel={() => setUnpausedWaiting(0)}
      />
    </Card>
  );
}

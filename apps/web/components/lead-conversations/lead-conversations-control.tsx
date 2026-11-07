"use client";

import { useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
} from "@smartreach/ui";
import {
  getLeadConversationStateAction,
  previewModeChangeAction,
  setCampaignAgentOfferAction,
  setCampaignConversationModeAction,
  setRunConversationModeAction,
} from "@/lib/lead-conversation-actions";
import {
  AGENT_PAUSED_WORKSPACE_NOTE,
  CAMPAIGN_PAUSED_NOTE,
  HAND_TO_AGENT_LABEL,
  LEAD_CONVERSATIONS_LABEL,
  MODE_DESCRIPTION,
  MODE_LABEL,
  ONLY_NEW_REPLIES_LABEL,
  SETTINGS_HREF,
  SETTING_LABEL,
  agentUnavailableNote,
  downgradedNote,
  effectiveLabel,
  openDraftsNote,
  waitingConfirmTitle,
  type CampaignConversationSetting,
  type LeadConversationMode,
  type LeadConversationState,
  type LeadConversationTarget,
} from "@/lib/lead-conversations";

const CAMPAIGN_OPTIONS: CampaignConversationSetting[] = ["default", "agent", "approve", "manual"];
const RUN_OPTIONS: CampaignConversationSetting[] = ["agent", "approve", "manual"];

/** Would the agent take part (Agent or Agent drafts) with this setting? */
function agentTakesPart(state: LeadConversationState, value: CampaignConversationSetting): boolean {
  if (state.agentPaused) return false;
  const base: LeadConversationMode = value === "default" ? state.workspaceDefault : value;
  return base !== "manual";
}

/**
 * Asked after a mode change that turns the agent on while conversations are
 * waiting. Closing it (Escape, outside click) cancels the change.
 */
export function HandOverDialog({
  open,
  waiting,
  pending,
  description,
  onChoose,
  onCancel,
}: {
  open: boolean;
  waiting: number;
  pending: boolean;
  /** Replaces the default explanation (e.g. after resuming a paused campaign). */
  description?: string;
  onChoose: (applyToWaiting: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{waitingConfirmTitle(waiting)}</DialogTitle>
          <DialogDescription>
            {description ??
              "The agent answers them with the new setting, after the same checks as any reply. Nothing is sent right now, and conversations someone already answered are left alone."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose(false)} disabled={pending}>
            {ONLY_NEW_REPLIES_LABEL}
          </Button>
          <Button onClick={() => onChoose(true)} loading={pending}>
            {HAND_TO_AGENT_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The one "Lead conversations" control: who answers leads for a campaign
 * (or an Autopilot run before it launches). Shows the mode in effect and
 * what the agent still needs. Used on the campaign page, the run page, the
 * campaign wizard and Guided setup.
 */
export function LeadConversationsControl({
  target,
  initialState,
  showOffer = false,
  label = LEAD_CONVERSATIONS_LABEL,
}: {
  target: LeadConversationTarget;
  initialState?: LeadConversationState | null;
  /** Campaigns only: the optional "What this campaign offers" field. */
  showOffer?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [state, setState] = useState<LeadConversationState | null>(initialState ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<{ value: CampaignConversationSetting; waiting: number } | null>(null);
  const [draftsNote, setDraftsNote] = useState<number>(0);
  const [offer, setOffer] = useState(initialState?.agentOffer ?? "");
  const [offerPending, startOffer] = useTransition();

  const targetKey = "campaignId" in target ? `c:${target.campaignId}` : `r:${target.runId}`;

  useEffect(() => {
    if (initialState) {
      setState(initialState);
      setOffer(initialState.agentOffer);
      return;
    }
    let cancelled = false;
    getLeadConversationStateAction(target)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) {
          setState(res.data);
          setOffer(res.data.agentOffer);
        } else setLoadError(res.ok ? "Couldn't load this setting." : res.error);
      })
      .catch(() => !cancelled && setLoadError("Couldn't load this setting."));
    return () => {
      cancelled = true;
    };
    // The target is identified by targetKey; the object itself changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, initialState]);

  if (loadError) {
    return <p className="text-[13px] text-muted-foreground">{loadError} Refresh the page to try again.</p>;
  }
  if (!state) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-9 w-full" />
        <span className="sr-only">Loading {label}</span>
      </div>
    );
  }

  const isCampaign = state.target.kind === "campaign";
  const options = isCampaign ? CAMPAIGN_OPTIONS : RUN_OPTIONS;
  const agentBlocked = !state.grounding.complete;

  const save = (value: CampaignConversationSetting, applyToWaiting: boolean) =>
    start(async () => {
      const res =
        state.target.kind === "campaign"
          ? await setCampaignConversationModeAction({ campaignId: state.target.campaignId, value, applyToWaiting })
          : await setRunConversationModeAction({
              runId: state.target.runId,
              mode: value === "default" ? state.workspaceDefault : value,
            });
      setConfirm(null);
      if (!res.ok) return void toast.error(res.error);
      if (res.data) setState(res.data.state);
      toast.success(res.message || "Saved");
      router.refresh();
    });

  const choose = (value: CampaignConversationSetting) => {
    if (value === state.setting || pending) return;
    setDraftsNote(0);
    if (state.target.kind !== "campaign") return save(value, false);
    const campaignId = state.target.campaignId;
    start(async () => {
      // Mode changes apply going forward; ask before touching waiting conversations.
      const preview = await previewModeChangeAction({ campaignId }).catch(() => null);
      const counts = preview && preview.ok && preview.data ? preview.data : { waiting: 0, openDrafts: 0 };
      if (agentTakesPart(state, value) && counts.waiting > 0) {
        setConfirm({ value, waiting: counts.waiting });
        return;
      }
      if (!agentTakesPart(state, value) && counts.openDrafts > 0) setDraftsNote(counts.openDrafts);
      save(value, false);
    });
  };

  const saveOffer = () =>
    startOffer(async () => {
      if (state.target.kind !== "campaign") return;
      const res = await setCampaignAgentOfferAction({ campaignId: state.target.campaignId, offer });
      if (!res.ok) return void toast.error(res.error);
      if (res.data) setState(res.data.state);
      toast.success(res.message || "Saved");
    });

  const selectedHint =
    state.setting === "default"
      ? `Follows your workspace default (${MODE_LABEL[state.workspaceDefault]}), set in Settings.`
      : MODE_DESCRIPTION[state.setting];

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={label}
        hint={
          <>
            In effect: <span className="font-medium text-foreground">{effectiveLabel(state.effective, state.setting)}</span>.{" "}
            {selectedHint}
          </>
        }
      >
        <Select value={state.setting} onValueChange={(v) => choose(v as CampaignConversationSetting)} disabled={pending}>
          <SelectTrigger id={`${id}-mode`} aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((value) => (
              <SelectItem
                key={value}
                value={value}
                // Agent needs grounding; a setting already on Agent stays selectable.
                disabled={value === "agent" && agentBlocked && state.setting !== "agent"}
              >
                {SETTING_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {state.agentPaused ? (
        <Alert variant="info">
          {AGENT_PAUSED_WORKSPACE_NOTE}, so you answer every reply.{" "}
          <Link href={SETTINGS_HREF} className="font-medium underline underline-offset-2">
            Turn it back on in Settings
          </Link>
          .
        </Alert>
      ) : state.campaignStatus === "paused" && state.effective.handledBy !== "you" ? (
        <Alert variant="info">{CAMPAIGN_PAUSED_NOTE} Replies wait for you in the Inbox.</Alert>
      ) : state.effective.downgraded ? (
        <Alert variant="warning">
          {downgradedNote(state.effective.missing)}{" "}
          <Link href={SETTINGS_HREF} className="font-medium underline underline-offset-2">
            Add it in Settings
          </Link>
          .
        </Alert>
      ) : agentBlocked ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {agentUnavailableNote(state.grounding.missing)}{" "}
          <Link href={SETTINGS_HREF} className="font-medium text-foreground underline underline-offset-2">
            Open Settings
          </Link>
        </p>
      ) : null}

      {draftsNote > 0 ? <Alert variant="info">{openDraftsNote(draftsNote)}</Alert> : null}

      {showOffer && isCampaign ? (
        <Field
          label="What this campaign offers"
          optional
          hint="Extra detail the agent can use when it answers leads from this campaign."
        >
          <Textarea
            id={`${id}-offer`}
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            rows={3}
            maxLength={500}
            className="text-[13px]"
            placeholder="A free reporting audit for finance teams of 10 to 50 people."
          />
        </Field>
      ) : null}
      {showOffer && isCampaign && offer.trim() !== state.agentOffer.trim() ? (
        <div className="-mt-2 flex justify-end">
          <Button size="sm" variant="outline" onClick={saveOffer} loading={offerPending}>
            Save offer
          </Button>
        </div>
      ) : null}

      <HandOverDialog
        open={confirm !== null}
        waiting={confirm?.waiting ?? 0}
        pending={pending}
        onChoose={(apply) => confirm && save(confirm.value, apply)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

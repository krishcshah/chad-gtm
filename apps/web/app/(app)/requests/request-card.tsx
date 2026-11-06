"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  FileText,
  HelpCircle,
  MessageSquareQuote,
  PenLine,
  Send,
  Sparkles,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Label,
  Textarea,
  toast,
  type BadgeProps,
} from "@smartreach/ui";
import { timeAgo } from "@smartreach/shared";
import {
  dismissAgentRequestAction,
  draftRequestReplyAction,
  resolveAgentRequestAction,
  setBookingUrlAction,
  type AgentRequestView,
} from "@/lib/autopilot-actions";

const KIND_META: Record<string, { label: string; icon: LucideIcon; variant: BadgeProps["variant"] }> = {
  resource: { label: "Wants a resource", icon: FileText, variant: "info" },
  question: { label: "Question", icon: HelpCircle, variant: "info" },
  approval: { label: "Approve draft", icon: PenLine, variant: "warning" },
  referral: { label: "Referral", icon: UserPlus, variant: "neutral" },
  booking_url: { label: "Booking link", icon: CalendarClock, variant: "brand" },
  other: { label: "Review", icon: MessageSquareQuote, variant: "neutral" },
};

export function kindMeta(kind: string) {
  return KIND_META[kind] ?? KIND_META.other!;
}

type Busy = "draft" | "send" | "booking" | null;

/** One escalation: who, what the agent needs, the lead's words, and the decision. */
export function RequestCard({ request }: { request: AgentRequestView }) {
  const router = useRouter();
  const meta = kindMeta(request.kind);
  const Icon = meta.icon;
  const [answer, setAnswer] = useState("");
  const [link, setLink] = useState("");
  const [save, setSave] = useState(true);
  const [draft, setDraft] = useState(request.kind === "approval" ? request.draftReply : "");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Busy>(null);

  const leadLabel = request.leadName || request.leadEmail;
  const firstName = leadLabel.split(" ")[0] || leadLabel;
  const titleId = `request-${request.id}`;

  const run = (kind: Busy, task: () => Promise<void>) => {
    setBusy(kind);
    start(async () => {
      try {
        await task();
      } finally {
        setBusy(null);
      }
    });
  };

  const makeDraft = () =>
    run("draft", async () => {
      const res = await draftRequestReplyAction({ requestId: request.id, answer, resourceUrl: link });
      if (!res.ok) return void toast.error(res.error);
      setDraft(res.data?.draft || "");
    });

  const send = () =>
    run("send", async () => {
      const res = await resolveAgentRequestAction({
        requestId: request.id,
        body: draft,
        answer,
        resourceUrl: link,
        saveToKnowledge: save,
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Sent");
      router.refresh();
    });

  const saveBooking = () =>
    run("booking", async () => {
      if (!request.runId) return void toast.error("This request is not linked to an autopilot run.");
      const res = await setBookingUrlAction(request.runId, link);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message || "Saved");
      router.refresh();
    });

  const dismiss = async () => {
    const res = await dismissAgentRequestAction(request.id);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast(res.message || "Dismissed");
    router.refresh();
  };

  return (
    <Card aria-labelledby={titleId} role="article">
      <header className="flex items-start gap-3 p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={titleId} className="text-[15px] font-semibold leading-snug tracking-[-0.01em]">
              {request.title}
            </h3>
            <Badge variant={meta.variant}>{meta.label}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">{leadLabel}</span>
            {request.leadCompany ? <> at {request.leadCompany}</> : null}
            {request.leadName ? <span className="break-all text-subtle-foreground"> · {request.leadEmail}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-subtle-foreground" suppressHydrationWarning>
            Asked {timeAgo(request.createdAt)}
            {request.companyName ? <> · {request.companyName} autopilot</> : null}
          </p>
        </div>
        <ConfirmDialog
          title={`Dismiss the request from ${leadLabel}?`}
          description={`Nothing is sent to ${firstName}, and the agent stops handling this thread. You can still reply yourself from the inbox.`}
          confirmLabel="Dismiss request"
          onConfirm={dismiss}
        >
          <Button variant="ghost" size="sm" disabled={pending} className="-mr-2 -mt-1 shrink-0">
            <X aria-hidden />
            <span className="hidden sm:inline">Dismiss</span>
            <span className="sr-only sm:hidden">Dismiss request</span>
          </Button>
        </ConfirmDialog>
      </header>

      <div className="flex flex-col gap-4 border-t border-border px-5 py-4">
        {request.question ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">What the agent needs</p>
            <p className="mt-1 text-sm leading-relaxed">{request.question}</p>
          </div>
        ) : null}
        {request.replyBody || !request.question ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {firstName} wrote{request.replySubject ? <span className="font-normal"> · {request.replySubject}</span> : null}
            </p>
            <blockquote
              tabIndex={0}
              aria-label={`Message from ${leadLabel}`}
              className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border-l-2 border-border-strong bg-muted/50 px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
            >
              {request.replyBody || "This message has no text."}
            </blockquote>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-b-xl border-t border-border bg-muted/40 px-5 py-4">
        {request.kind === "booking_url" ? (
          <>
            <Field
              label="Your booking link"
              hint="Saved to your autopilot run. The agent then answers this lead and anyone else who wants to meet."
            >
              <Input
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://cal.com/you/intro"
              />
            </Field>
            <div className="flex justify-end">
              <Button onClick={saveBooking} loading={busy === "booking"} disabled={pending || !link.trim()}>
                {busy === "booking" ? null : <CalendarClock aria-hidden />}
                Save link
              </Button>
            </div>
          </>
        ) : request.kind === "approval" ? (
          <>
            <Field label="Agent's draft" hint={`Edit anything you like. It goes to ${request.leadEmail} when you approve.`}>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="bg-card text-[13px]" />
            </Field>
            <div className="flex justify-end">
              <Button onClick={send} loading={busy === "send"} disabled={pending || draft.trim().length < 5}>
                {busy === "send" ? null : <Send aria-hidden />}
                Approve and send
              </Button>
            </div>
          </>
        ) : !draft ? (
          <>
            <Field
              label="Your answer"
              hint="Write it in your own words. The agent turns it into a reply you can check before it goes out."
            >
              <Textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                className="bg-card text-[13px]"
                placeholder={
                  request.kind === "resource"
                    ? "Here's our case study with Acme. They cut reporting time from 5 days to 1."
                    : "The answer the agent should give"
                }
              />
            </Field>
            <Field label="Link" optional hint="A deck, case study or doc to include in the reply.">
              <Input
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://"
                className="bg-card"
              />
            </Field>
            <div className="flex items-start gap-2.5">
              <Checkbox id={`${titleId}-save`} checked={save} onCheckedChange={(v) => setSave(v === true)} className="mt-0.5" />
              <Label htmlFor={`${titleId}-save`} className="font-normal leading-snug text-muted-foreground">
                Save to the knowledge base so the agent can reuse it
              </Label>
            </div>
            <div className="flex justify-end">
              <Button onClick={makeDraft} loading={busy === "draft"} disabled={pending || (!answer.trim() && !link.trim())}>
                {busy === "draft" ? null : <Sparkles aria-hidden />}
                Draft reply
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field label={`Reply to ${firstName}`} hint={`Check it, then send. It goes to ${request.leadEmail}.`}>
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} className="bg-card text-[13px]" />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setDraft("")} disabled={pending}>
                Edit answer
              </Button>
              <Button onClick={send} loading={busy === "send"} disabled={pending || draft.trim().length < 5}>
                {busy === "send" ? null : <Send aria-hidden />}
                Send reply
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  FileText,
  HelpCircle,
  Inbox,
  MessageSquareQuote,
  MessagesSquare,
  PenLine,
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
  addReferralLeadAction,
  dismissAgentRequestAction,
  draftRequestReplyAction,
  setBookingUrlAction,
  type AgentRequestView,
} from "@/lib/autopilot-actions";
import { AGENT_OFF_BADGE, REQUEST_ALREADY_HANDLED } from "@/lib/lead-conversations";

const KIND_META: Record<string, { label: string; icon: LucideIcon; variant: BadgeProps["variant"] }> = {
  resource: { label: "Wants a resource", icon: FileText, variant: "info" },
  question: { label: "Question", icon: HelpCircle, variant: "info" },
  approval: { label: "Approve draft", icon: PenLine, variant: "warning" },
  referral: { label: "Referral", icon: UserPlus, variant: "neutral" },
  booking_url: { label: "Booking link", icon: CalendarClock, variant: "brand" },
  handoff: { label: "Handed to you", icon: MessageSquareQuote, variant: "neutral" },
  other: { label: "Review", icon: MessageSquareQuote, variant: "neutral" },
};

export function kindMeta(kind: string) {
  return KIND_META[kind] ?? KIND_META.other!;
}

type Busy = "draft" | "booking" | "referral" | null;

/** Kinds whose reply is a draft to check in the Inbox, not an answer to write here. */
const REVIEW_KINDS = new Set(["approval", "handoff", "other"]);

/** Inbox link that opens this card's conversation. */
export function conversationHref(replyId: string | null): string {
  return replyId ? `/unibox?reply=${encodeURIComponent(replyId)}` : "/unibox";
}

/**
 * One conversation waiting on you: who, what the agent needs and the lead's
 * words. Replies are written and sent in the Inbox conversation; the card
 * keeps what is not a reply (booking link, your answer for the draft).
 */
export function RequestCard({ request }: { request: AgentRequestView }) {
  const router = useRouter();
  const meta = kindMeta(request.kind);
  const Icon = meta.icon;
  const [answer, setAnswer] = useState("");
  const [link, setLink] = useState("");
  const [referral, setReferral] = useState(request.referralEmail ?? "");
  // Only an answer to a question or a resource request is worth reusing.
  const [save, setSave] = useState(request.kind === "question" || request.kind === "resource");
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

  /** Another tab, a teammate or the Inbox got there first: say so and show the latest. */
  const fail = (error: string) => {
    toast.error(error);
    if (error === REQUEST_ALREADY_HANDLED) router.refresh();
  };
  // A reply is being sent for this card right now: nothing here can act on it.
  const sending = request.status === "sending";

  const href = conversationHref(request.replyId);
  // With the agent off, the answer is yours: open the conversation and write it there.
  const reviewOnly = REVIEW_KINDS.has(request.kind) || request.agentOff;
  const draft = request.draftReply.trim();

  // The draft is saved to the card and opens in the Inbox reply box for a final check.
  const makeDraft = () =>
    run("draft", async () => {
      const res = await draftRequestReplyAction({ requestId: request.id, answer, resourceUrl: link, save });
      if (!res.ok) return void fail(res.error);
      router.push(conversationHref(res.data?.replyId ?? request.replyId));
    });

  const saveBooking = () =>
    run("booking", async () => {
      if (!request.runId) return void toast.error("This request is not linked to an autopilot run.");
      const res = await setBookingUrlAction(request.runId, link);
      if (!res.ok) return void fail(res.error);
      toast.success(res.message || "Saved");
      router.refresh();
    });

  const addReferral = () =>
    run("referral", async () => {
      const res = await addReferralLeadAction({ requestId: request.id, email: referral });
      if (!res.ok) return void fail(res.error);
      toast.success(res.message || "Added");
      router.refresh();
    });

  const dismiss = async () => {
    const res = await dismissAgentRequestAction(request.id);
    if (!res.ok) {
      fail(res.error);
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
            {request.agentOff ? <Badge variant="neutral">{AGENT_OFF_BADGE}</Badge> : null}
            {sending ? (
              <Badge variant="info" dot>
                Sending
              </Badge>
            ) : null}
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
        {request.replyId ? (
          <Button asChild variant="ghost" size="sm" className="-mt-1 shrink-0">
            <Link href={href}>
              <MessagesSquare aria-hidden />
              <span className="hidden sm:inline">View conversation</span>
              <span className="sr-only sm:hidden">View conversation</span>
            </Link>
          </Button>
        ) : null}
        <ConfirmDialog
          title={`Dismiss the request from ${leadLabel}?`}
          description={`Nothing is sent to ${firstName}. The conversation moves to you, and the agent won't reply to ${firstName} again unless you hand it back from the Inbox.`}
          confirmLabel="Dismiss and take over"
          onConfirm={dismiss}
        >
          <Button variant="ghost" size="sm" disabled={pending || sending} className="-mr-2 -mt-1 shrink-0">
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
              hint="Saved to this Autopilot run. The agent then answers the leads waiting for it, except conversations you've already answered."
            >
              <Input
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://cal.com/you/intro"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <Link href={href}>
                  <Inbox aria-hidden />
                  Open conversation
                </Link>
              </Button>
              <Button onClick={saveBooking} loading={busy === "booking"} disabled={pending || sending || !link.trim()}>
                {busy === "booking" ? null : <CalendarClock aria-hidden />}
                Save link
              </Button>
            </div>
          </>
        ) : request.kind === "referral" && !request.agentOff ? (
          <>
            {draft ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {request.draftSource === "you" ? "Draft from your answer" : "Agent's draft"}
                </p>
                <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                  {draft}
                </p>
              </div>
            ) : null}
            <Field
              label="New contact's email"
              hint="Added to this campaign's lead list and emailed by the campaign like any other lead. Opted-out and blocked addresses are refused."
            >
              <Input
                type="email"
                inputMode="email"
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                placeholder="jane@acme.com"
                className="bg-card"
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <Link href={href}>
                  <Inbox aria-hidden />
                  Open conversation
                </Link>
              </Button>
              <Button
                onClick={addReferral}
                loading={busy === "referral"}
                disabled={pending || sending || !referral.trim()}
                className="min-w-0"
              >
                {busy === "referral" ? null : <UserPlus aria-hidden />}
                <span className="truncate">
                  {referral.trim() ? `Add ${referral.trim()} as a lead to this campaign` : "Add as a lead to this campaign"}
                </span>
              </Button>
            </div>
          </>
        ) : reviewOnly ? (
          <>
            {draft ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {request.draftSource === "you" ? "Draft from your answer" : "Agent's draft"}
                </p>
                <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                  {draft}
                </p>
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button asChild>
                <Link href={href}>
                  <Inbox aria-hidden />
                  {request.agentOff ? "Answer in Inbox" : "Review in Inbox"}
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            {draft ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {request.draftSource === "you" ? "Draft from your answer" : "Agent's draft"}
                </p>
                <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                  {draft}
                </p>
              </div>
            ) : null}
            <Field
              label="Your answer"
              hint="Write it in your own words. The agent turns it into a reply you check in the Inbox before it goes out."
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
            {request.kind === "question" || request.kind === "resource" ? (
              <div className="flex items-start gap-2.5">
                <Checkbox id={`${titleId}-save`} checked={save} onCheckedChange={(v) => setSave(v === true)} className="mt-0.5" />
                <Label htmlFor={`${titleId}-save`} className="font-normal leading-snug text-muted-foreground">
                  Save to the knowledge base once the reply is sent, so the agent can reuse it
                </Label>
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button asChild variant="outline">
                <Link href={href}>
                  <Inbox aria-hidden />
                  {draft ? "Review in Inbox" : "Open conversation"}
                </Link>
              </Button>
              <Button
                onClick={makeDraft}
                loading={busy === "draft"}
                disabled={pending || sending || (!answer.trim() && !link.trim())}
              >
                {busy === "draft" ? null : <Sparkles aria-hidden />}
                Draft reply
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

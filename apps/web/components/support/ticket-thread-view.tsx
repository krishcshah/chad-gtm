"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { formatDate, formatDateTime, timeAgo } from "@smartreach/shared";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardFooter,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Kbd,
  Label,
  PageHeader,
  Textarea,
  cn,
} from "@smartreach/ui";
import { Page } from "@/components/layout/page";
import { addTicketMessageAction, updateTicketStatusAction } from "@/lib/support-actions";
import type { SupportTicketDTO, SupportTicketMessageDTO, TicketStatus } from "@/lib/support-types";
import { TicketCategoryBadge } from "./ticket-category-badge";
import { TICKET_STATUS_META, TicketStatusBadge, ticketStatusLabel } from "./ticket-status-badge";
import { customerStatusAction, statusAfterReply } from "@/lib/support-status";

const STATUS_ORDER: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

/** Only http(s) links are rendered as links; older tickets may hold any text in `url`. */
function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function initialOf(name: string | null, email: string) {
  return (name || email || "?").trim().slice(0, 1).toUpperCase();
}

export function TicketThreadView({
  ticket,
  messages,
  isAdminUser,
  currentUserId,
}: {
  ticket: SupportTicketDTO;
  messages: SupportTicketMessageDTO[];
  isAdminUser: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const replyId = useId();
  const hintId = useId();
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

  // Seeded tickets always have the description as the first message; older ones may not.
  const thread: SupportTicketMessageDTO[] =
    messages.length > 0
      ? messages
      : [
          {
            id: `${ticket.id}-description`,
            ticketId: ticket.id,
            userId: ticket.userId,
            userName: ticket.userName,
            userEmail: ticket.userEmail,
            senderRole: "user",
            message: ticket.description,
            createdAt: ticket.createdAt,
          },
        ];

  function sendReply() {
    const text = replyText.trim();
    if (!text || isPending) return;
    startTransition(async () => {
      const res = await addTicketMessageAction(ticket.id, text);
      if (res.ok) {
        setReplyText("");
        toast.success("Reply sent");
        router.refresh();
      } else {
        toast.error(res.error || "Your reply could not be sent. Try again.");
      }
    });
  }

  function changeStatus(next: TicketStatus) {
    if (next === ticket.status) return;
    startStatusTransition(async () => {
      const res = await updateTicketStatusAction(ticket.id, next);
      if (res.ok) {
        toast.success(`Marked as ${ticketStatusLabel(next).toLowerCase()}`);
        router.refresh();
      } else {
        toast.error(res.error || "The status could not be changed.");
      }
    });
  }

  const pageUrl = safeHttpUrl(ticket.url);

  const statusAfterMyReply = statusAfterReply(ticket.status, isAdminUser);
  const replyHint =
    statusAfterMyReply === ticket.status
      ? null
      : isAdminUser
        ? "Replying marks this ticket as in progress."
        : "Replying reopens this ticket.";
  const customerAction = customerStatusAction(ticket.status);
  // Admins opening someone else's ticket came from the admin queue, so lead back there.
  const backToAdminQueue = isAdminUser && ticket.userId !== currentUserId;

  return (
    <Page width="narrow">
      <PageHeader
        eyebrow={
          <Link
            href={backToAdminQueue ? "/admin?tab=support" : "/support"}
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> {backToAdminQueue ? "Admin queue" : "Support"}
          </Link>
        }
        title={ticket.heading}
        meta={
          <>
            <TicketStatusBadge status={ticket.status} />
            <TicketCategoryBadge category={ticket.category} />
            <span className="min-w-0 break-words text-xs text-subtle-foreground" suppressHydrationWarning>
              Opened {formatDate(ticket.createdAt)}
              {isAdminUser || ticket.userId !== currentUserId ? ` by ${ticket.userEmail}` : ""}
            </span>
            {pageUrl ? (
              <a
                href={pageUrl}
                target="_blank"
                rel="noreferrer noopener"
                title={pageUrl}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-border-strong underline-offset-4 hover:text-foreground hover:decoration-foreground"
              >
                Page link
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : null}
          </>
        }
        actions={
          isAdminUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" loading={statusPending}>
                  Status: {ticketStatusLabel(ticket.status)}
                  <ChevronDown aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Set status</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={ticket.status} onValueChange={(v) => changeStatus(v as TicketStatus)}>
                  {STATUS_ORDER.map((s) => (
                    <DropdownMenuRadioItem key={s} value={s}>
                      {TICKET_STATUS_META[s].label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button variant="outline" loading={statusPending} onClick={() => changeStatus(customerAction.to)}>
              {customerAction.label}
            </Button>
          )
        }
      />

      <section aria-label="Conversation" className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
          Conversation{" "}
          <span className="tabular font-normal text-subtle-foreground">{thread.length.toLocaleString()}</span>
        </h2>
        <Card>
          <ol className="divide-y divide-border">
            {thread.map((msg) => (
              <MessageItem key={msg.id} message={msg} isMine={msg.userId === currentUserId} />
            ))}
          </ol>
        </Card>
      </section>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendReply();
          }}
        >
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor={replyId}>{isAdminUser ? "Reply as support" : "Reply"}</Label>
            <Textarea
              id={replyId}
              rows={4}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendReply();
                }
              }}
              aria-describedby={replyHint ? hintId : undefined}
              placeholder={isAdminUser ? "Write your answer to the customer" : "Add details or answer our question"}
              disabled={isPending}
            />
            {replyHint ? (
              <p id={hintId} className="text-xs text-muted-foreground">
                {replyHint}
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="justify-between">
            <span className="hidden items-center gap-1 text-xs text-subtle-foreground sm:inline-flex">
              <Kbd>Ctrl</Kbd>
              <Kbd>Enter</Kbd>
              <span className="ml-1">to send</span>
            </span>
            <Button type="submit" loading={isPending} disabled={!replyText.trim()} className="ml-auto">
              Send reply
            </Button>
          </CardFooter>
        </form>
      </Card>
    </Page>
  );
}

function MessageItem({ message: msg, isMine }: { message: SupportTicketMessageDTO; isMine: boolean }) {
  const fromSupport = msg.senderRole === "admin";
  return (
    <li className="flex gap-3 px-5 py-4">
      <Avatar className="mt-0.5">
        <AvatarFallback
          className={cn(
            "text-xs font-medium",
            fromSupport ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {initialOf(msg.userName, msg.userEmail)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{msg.userName || msg.userEmail}</span>
          {fromSupport ? <Badge variant="neutral">Support</Badge> : null}
          {isMine && !fromSupport ? <span className="text-xs text-subtle-foreground">You</span> : null}
          <time
            dateTime={msg.createdAt}
            title={formatDateTime(msg.createdAt)}
            className="ml-auto shrink-0 text-xs text-subtle-foreground"
            suppressHydrationWarning
          >
            {timeAgo(msg.createdAt)}
          </time>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{msg.message}</p>
      </div>
    </li>
  );
}

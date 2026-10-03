"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Textarea,
  Separator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@smartreach/ui";
import {
  ChevronLeft,
  Send,
  Loader2,
  ExternalLink,
  ShieldCheck,
  User,
  Clock,
  MoreVertical,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@smartreach/shared";
import { TicketCategoryBadge } from "./ticket-category-badge";
import { TicketStatusBadge } from "./ticket-status-badge";
import { addTicketMessageAction, updateTicketStatusAction } from "@/lib/support-actions";
import type { SupportTicketDTO, SupportTicketMessageDTO, TicketStatus } from "@/lib/support-types";

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
  const [replyText, setReplyText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [statusPending, startStatusTransition] = useTransition();

  const handleSendReply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim()) return;

    startTransition(async () => {
      const res = await addTicketMessageAction(ticket.id, replyText.trim());
      if (res.ok) {
        setReplyText("");
        toast.success("Reply added to thread.");
        router.refresh();
      } else {
        toast.error(res.error || "Failed to post reply.");
      }
    });
  };

  const handleStatusChange = (newStatus: TicketStatus) => {
    startStatusTransition(async () => {
      const res = await updateTicketStatusAction(ticket.id, newStatus);
      if (res.ok) {
        toast.success(`Status updated to ${newStatus}`);
        router.refresh();
      } else {
        toast.error(res.error || "Failed to update status.");
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto font-mono">
      {/* Top Navigation & Status Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Link
              href="/support"
              className="text-xs text-zinc-500 hover:text-white flex items-center gap-1 uppercase tracking-wider transition-colors"
            >
              <ChevronLeft className="size-3.5" /> Back to Support
            </Link>
            <span className="text-zinc-700">•</span>
            <TicketCategoryBadge category={ticket.category} />
            <TicketStatusBadge status={ticket.status} />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wider text-white">
            {ticket.heading}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 font-sans">
            <span>Submitted by <strong className="text-zinc-300 font-mono">{ticket.userEmail}</strong></span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" /> {formatDate(ticket.createdAt)}
            </span>
            {ticket.url && (
              <>
                <span>•</span>
                <a
                  href={ticket.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-white hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  <ExternalLink className="size-3" /> Context URL
                </a>
              </>
            )}
          </div>
        </div>

        {/* Status Switcher & Management */}
        <div className="flex items-center gap-2 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={statusPending}
                className="rounded-none border-zinc-800 bg-black text-xs font-mono uppercase tracking-wider text-zinc-300 hover:bg-zinc-900 hover:text-white h-9 px-3 gap-2"
              >
                {statusPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Status: {ticket.status}</span>
                    <MoreVertical className="size-3.5 text-zinc-500" />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-none border-zinc-800 bg-black font-mono">
              <DropdownMenuItem onClick={() => handleStatusChange("open")}>
                Mark as Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("in_progress")}>
                Mark as Ongoing (In Progress)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("resolved")}>
                Mark as Resolved
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleStatusChange("closed")}>
                Mark as Closed
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {isAdminUser && (
            <span className="rounded-none border border-zinc-700 bg-zinc-900 px-2 py-1 text-[9px] uppercase tracking-widest text-zinc-300">
              Admin Mode
            </span>
          )}
        </div>
      </div>

      {/* Conversation Thread Stream */}
      <div className="space-y-4">
        <div className="text-[11px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-2">
          <span>Conversation History ({messages.length} messages)</span>
          <div className="h-px flex-1 bg-zinc-900" />
        </div>

        {messages.map((msg, index) => {
          const isAdminMsg = msg.senderRole === "admin";
          const isCurrentUser = msg.userId === currentUserId;

          return (
            <div
              key={msg.id}
              className={`rounded-none border p-4 sm:p-5 transition-colors ${
                isAdminMsg
                  ? "border-zinc-700 bg-zinc-950/80 shadow-sm"
                  : "border-zinc-800/80 bg-black/70"
              }`}
            >
              {/* Message Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex size-6 items-center justify-center rounded-none border text-xs ${
                      isAdminMsg
                        ? "border-white bg-white text-black font-bold"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300"
                    }`}
                  >
                    {isAdminMsg ? <ShieldCheck className="size-3.5" /> : <User className="size-3.5" />}
                  </div>

                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {msg.userName || msg.userEmail}
                  </span>

                  {isAdminMsg ? (
                    <span className="rounded-none border border-white bg-black px-1.5 py-0.2 text-[8px] font-mono tracking-widest text-white uppercase">
                      Admin / Core Team
                    </span>
                  ) : (
                    <span className="rounded-none border border-zinc-800 bg-zinc-900 px-1.5 py-0.2 text-[8px] font-mono tracking-widest text-zinc-400 uppercase">
                      Author
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-zinc-500 font-sans flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDate(msg.createdAt)}
                  {index === 0 && <span className="ml-1 text-zinc-400 font-mono">(Initial Ticket)</span>}
                </div>
              </div>

              {/* Message Body */}
              <div className="text-xs text-zinc-300 font-sans leading-relaxed whitespace-pre-wrap">
                {msg.message}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reply Box */}
      <div className="rounded-none border border-zinc-800 bg-zinc-950 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
            <Send className="size-3.5 text-zinc-400" />
            <span>Post Reply</span>
          </div>

          {ticket.status === "resolved" && (
            <span className="text-[10px] text-zinc-400 font-sans flex items-center gap-1">
              <AlertCircle className="size-3 text-amber-400" />
              Replying will automatically reopen this ticket for engineering review.
            </span>
          )}
        </div>

        <form onSubmit={handleSendReply} className="space-y-3">
          <Textarea
            rows={4}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                handleSendReply();
              }
            }}
            placeholder={
              isAdminUser
                ? "Write an official response or resolution update as ChadGTM Engineering... (Ctrl+Enter to send)"
                : "Type your reply or additional details here... (Ctrl+Enter to send)"
            }
            className="rounded-none border-zinc-800 bg-black text-xs text-white placeholder:text-zinc-600 focus:border-white font-mono resize-y"
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <span className="text-[10px] text-zinc-500 font-mono">
              Press <kbd className="border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-300">Ctrl</kbd> + <kbd className="border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-300">Enter</kbd> to dispatch
            </span>

            <Button
              type="submit"
              disabled={isPending || !replyText.trim()}
              className="rounded-none bg-white hover:bg-zinc-200 text-black font-semibold text-xs font-mono uppercase tracking-wider h-9 px-5 gap-2 shrink-0"
            >
              {isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Dispatching...
                </>
              ) : (
                <>
                  <Send className="size-3.5" /> Send Reply
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

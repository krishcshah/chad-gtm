"use client";
import { formatDistanceToNow } from "date-fns";
import { Inbox, Mail, MailOpen, SendHorizonal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, EmptyState, Textarea } from "@smartreach/ui";
import { sendUniboxReply } from "@/lib/actions";

interface ReplyRow {
  id: string; fromName: string; fromEmail: string; subject: string; snippet: string;
  bodyText: string; bodyHtml: string; receivedAt: string; readAt: string | null;
  campaignName: string | null; senderEmail: string | null; senderName: string | null;
}

/** Sanitize reply html (strip scripts/iframes/forms) then render in a sandboxed iframe
 * so it looks like a real mail client. Falls back to text if it's not HTML. */
function EmailBody({ html }: { html: string }) {
  const isHtml = /<\/?[a-z][\s\S]*?>/.test(html);
  const sanitized = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/<base[\s\S]*?>/gi, "");
  if (!isHtml) {
    return <div className="whitespace-pre-wrap rounded-lg border bg-background/60 p-4 text-sm leading-relaxed text-foreground/90">{html}</div>;
  }
  return (
    <iframe
      title="reply body"
      className="h-full w-full rounded-lg border bg-white"
      sandbox="allow-same-origin"
      srcDoc={`<!doctype html><html><head><style>body{margin:0;padding:18px;font:14px/1.6 -apple-system,sans-serif;color:#0a1128;background:#fff;}img{max-width:100%}blockquote{margin:0;padding-left:1em;border-left:3px solid #ddd}</style></head><body>${sanitized}</body></html>`}
    />
  );
}

export function UniboxClient({ initial }: { initial: ReplyRow[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const unread = initial.filter((r) => !r.readAt).length;

  const send = (row: ReplyRow) => {
    const text = body.trim();
    if (!text) { toast.error("Write a message first"); return; }
    start(async () => {
      const res = await sendUniboxReply({ replyId: row.id, body: text });
      if (res.ok) { toast.success(res.message ?? "Reply sent"); setBody(""); router.refresh(); }
      else toast.error(res.ok ? "Send failed" : res.error);
    });
  };

  return (
    <div className="unibox-root flex h-dvh flex-col lg:-ml-60 lg:pl-60">
      <header className="flex items-center justify-between pb-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Inbox className="size-4" aria-hidden /></span>
          Unibox
        </h1>
        <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">{unread} unread</span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(240px,320px)_1fr] overflow-hidden rounded-xl border bg-card">
        {/* left: list — full width on mobile when no thread open */}
        <div className={`min-h-0 overflow-y-auto border-r border-border/60 ${activeId ? "hidden md:block" : "block"}`}>
          {initial.length === 0 && (
            <EmptyState
              icon={Inbox}
              title="No replies yet"
              description="When prospects reply to your campaigns, conversations appear here in Unibox."
              className="m-4 border-0 bg-transparent py-10"
            />
          )}
          {initial.map((r) => {
            const name = r.fromName || r.fromEmail.split("@")[0];
            const isUnread = !r.readAt;
            const isActive = activeId === r.id;
            return (
              <button key={r.id} type="button" onClick={() => setActiveId(r.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isActive ? "bg-accent/60" : "hover:bg-accent/30"} ${isUnread ? "bg-primary/[0.04]" : ""}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-[13px] ${isUnread ? "font-semibold" : "font-medium"}`}>{name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{r.receivedAt ? formatDistanceToNow(new Date(r.receivedAt), { addSuffix: true }) : ""}</span>
                </span>
                <span className={`truncate text-xs ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>{r.subject || "(no subject)"}</span>
                <span className="line-clamp-1 text-[11px] text-muted-foreground/80">{r.snippet || r.bodyText}</span>
              </button>
            );
          })}
        </div>

        {/* right: thread — full screen on mobile when a conversation is open */}
        <div className={`flex min-h-0 flex-col bg-card/40 ${activeId ? "flex" : "hidden md:flex"}`}>
          {activeId ? (
            (() => {
              const r = initial.find((x) => x.id === activeId)!;
              const name = r.fromName || r.fromEmail;
              return (
                <>
                  <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
                    <div>
                      <p className="font-semibold">{r.subject || "(no subject)"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        From {name} {"<"}{r.fromEmail}{">"} → {r.senderEmail ?? ""} · {r.receivedAt ? new Date(r.receivedAt).toLocaleString() : ""}
                      </p>
                      {r.campaignName && <span className="mt-2 inline-block rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{r.campaignName}</span>}
                    </div>
                    <button type="button" aria-label="Back to conversations" onClick={() => setActiveId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent md:aria-[label]:content-auto"><X className="size-4" /></button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                    <EmailBody html={r.bodyHtml || r.bodyText || r.snippet || ""} />
                  </div>
                  <div className="border-t border-border/60 px-5 py-3">
                    <label className="mb-2 block text-xs font-medium text-muted-foreground">Reply via {r.senderEmail ?? "your sender"}</label>
                    <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Hi ${name.split(" ")[0]},…`} />
                    <div className="mt-2.5 flex items-center gap-2">
                      <Button onClick={() => send(r)} disabled={pending} size="sm">
                        <SendHorizonal className="size-4" /> {pending ? "Sending…" : "Send reply"}
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
